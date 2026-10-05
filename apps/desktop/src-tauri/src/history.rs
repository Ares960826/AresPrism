use git2::{
    DiffOptions, Index, IndexAddOption, ObjectType, Oid, Repository, RepositoryInitOptions,
    Signature, Tree, TreeWalkMode, TreeWalkResult,
};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

// ─── Types ───

#[derive(Serialize, Clone)]
pub struct SnapshotInfo {
    pub id: String,
    /// First-parent of this snapshot; `None` only for the root commit.
    pub parent_id: Option<String>,
    /// Message without the internal `Excludes-Version` trailer.
    pub message: String,
    pub timestamp: i64,
    pub labels: Vec<String>,
    pub changed_files: Vec<String>,
}

#[derive(Serialize)]
pub struct FileDiff {
    pub file_path: String,
    pub status: String, // "added" | "modified" | "deleted"
    pub old_content: Option<String>,
    pub new_content: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct RestoreResult {
    /// The `[restore]` commit that now holds the restored files. `None` when
    /// the working tree already matched the target (nothing was changed).
    pub snapshot: Option<SnapshotInfo>,
    /// The version the project was at right before the restore: a fresh
    /// `[auto] Before restore` snapshot when the working tree had changes,
    /// otherwise the previous HEAD. Restoring it undoes the restore.
    pub previous_id: String,
}

// ─── Helpers ───

/// Serializes all history operations. Commands run on the blocking pool, and
/// concurrent snapshots/restores on one repo would race on the index lock.
static HISTORY_LOCK: Mutex<()> = Mutex::new(());

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = HISTORY_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        task()
    })
    .await
    .map_err(|e| format!("History task failed: {}", e))?
}

fn history_path(project_root: &str) -> PathBuf {
    Path::new(project_root)
        .join(".claudeprism")
        .join("history.git")
}

fn open_repo(project_root: &str) -> Result<Repository, String> {
    let git_dir = history_path(project_root);
    Repository::open(&git_dir).map_err(|e| format!("Failed to open history repo: {}", e))
}

fn default_signature() -> Result<Signature<'static>, String> {
    Signature::now("ClaudePrism", "history@claudeprism.local")
        .map_err(|e| format!("Failed to create signature: {}", e))
}

// ─── Exclude-template trailer ───
//
// Every commit records which exclude template it was taken under, so a
// restore knows which files the target version could not have contained.

/// Version of `EXCLUDES_CONTENT`. v1 (no trailer) excluded `*.pdf`.
const EXCLUDES_VERSION: u32 = 2;
const EXCLUDES_TRAILER_KEY: &str = "Excludes-Version: ";

fn commit_message(message: &str) -> String {
    format!(
        "{}\n\n{}{}",
        message, EXCLUDES_TRAILER_KEY, EXCLUDES_VERSION
    )
}

/// Message shown to the UI: the commit message without the trailer block.
fn display_message(raw: &str) -> String {
    let trimmed = raw.trim_end();
    match trimmed.rfind("\n\n") {
        Some(pos) if trimmed[pos + 2..].starts_with(EXCLUDES_TRAILER_KEY) => {
            trimmed[..pos].to_string()
        }
        _ => raw.to_string(),
    }
}

/// Exclude-template version a commit was taken under (1 when no trailer).
fn excludes_version_of(raw: &str) -> u32 {
    raw.lines()
        .rev()
        .find_map(|line| line.strip_prefix(EXCLUDES_TRAILER_KEY))
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(1)
}

/// Whether a path was excluded from history by an older template, i.e. a
/// commit from that era cannot contain it even if the file existed.
fn excluded_by_template(version: u32, path: &str) -> bool {
    version < 2 && path.to_ascii_lowercase().ends_with(".pdf")
}

fn parent_id_of(repo: &Repository, oid: Oid) -> Option<String> {
    repo.find_commit(oid)
        .ok()
        .and_then(|c| c.parent_id(0).ok())
        .map(|p| p.to_string())
}

// ─── Labels ───
//
// Labels are lightweight tags. Git ref names cannot hold spaces, many
// punctuation characters or arbitrary Unicode, so the display name is stored
// as `ap-label/<lowercase hex of UTF-8>`. Lowercase hex stays unique on
// case-insensitive filesystems, and the namespace cannot collide with the
// single-segment tags older versions created; those are shown verbatim.

const LABEL_TAG_PREFIX: &str = "ap-label/";
const LABEL_MAX_CHARS: usize = 80;
/// Loose refs are files; keep the hex name well under the 255-byte limit.
const LABEL_MAX_BYTES: usize = 120;

fn normalize_label(label: &str) -> Result<String, String> {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return Err("Label cannot be empty".into());
    }
    if trimmed.chars().count() > LABEL_MAX_CHARS || trimmed.len() > LABEL_MAX_BYTES {
        return Err(format!(
            "Label is too long (max {} characters)",
            LABEL_MAX_CHARS
        ));
    }
    if trimmed.chars().any(char::is_control) {
        return Err("Label cannot contain control characters".into());
    }
    Ok(trimmed.to_string())
}

fn encode_label(display: &str) -> String {
    let mut out = String::with_capacity(LABEL_TAG_PREFIX.len() + display.len() * 2);
    out.push_str(LABEL_TAG_PREFIX);
    for byte in display.as_bytes() {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

fn decode_label(tag_name: &str) -> String {
    if let Some(hex) = tag_name.strip_prefix(LABEL_TAG_PREFIX) {
        let is_hex = !hex.is_empty()
            && hex.len() % 2 == 0
            && hex
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
        if is_hex {
            let bytes: Option<Vec<u8>> = (0..hex.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
                .collect();
            if let Some(Ok(decoded)) = bytes.map(String::from_utf8) {
                if !decoded.is_empty() && !decoded.chars().any(char::is_control) {
                    return decoded;
                }
            }
        }
    }
    tag_name.to_string()
}

/// Map of commit OID → raw tag names (as stored under `refs/tags/`).
fn raw_tag_map(repo: &Repository) -> HashMap<Oid, Vec<String>> {
    let mut map: HashMap<Oid, Vec<String>> = HashMap::new();
    if let Ok(tags) = repo.tag_names(None) {
        for tag_name in tags.iter().flatten() {
            if let Ok(reference) = repo.find_reference(&format!("refs/tags/{}", tag_name)) {
                if let Ok(commit) = reference.peel_to_commit() {
                    map.entry(commit.id())
                        .or_default()
                        .push(tag_name.to_string());
                }
            }
        }
    }
    map
}

/// Build a map of commit OID → display labels for quick label lookup
fn tag_map(repo: &Repository) -> HashMap<Oid, Vec<String>> {
    raw_tag_map(repo)
        .into_iter()
        .map(|(oid, names)| (oid, names.iter().map(|n| decode_label(n)).collect()))
        .collect()
}

/// Raw tag name whose display label equals `display`, if any.
fn find_label_tag(repo: &Repository, display: &str) -> Option<String> {
    let tags = repo.tag_names(None).ok()?;
    let found = tags
        .iter()
        .flatten()
        .find(|name| decode_label(name) == display)
        .map(str::to_string);
    found
}

// ─── Excludes ───

const EXCLUDES_HEADER: &str = "# AresPrism history-exclude v2";

const EXCLUDES_CONTENT: &str = r#"# AresPrism history-exclude v2
# LaTeX build artifacts
*.aux
*.log
*.out
*.toc
*.lof
*.lot
*.fls
*.fdb_latexmk
*.synctex.gz
*.synctex
*.bbl
*.blg
*.nav
*.snm
*.vrb
*.bcf
*.run.xml
*.xdv

# OS files
.DS_Store
Thumbs.db

# Git
.git/

# ClaudePrism internal (build output lives in .prism/)
.claudeprism/
.prism/
"#;

/// Templates written by earlier versions (v1 with and without `.prism/`).
/// A file equal to one of these was never customised and is replaced.
const PREVIOUS_EXCLUDES_TEMPLATES: [&str; 2] = [
    "# LaTeX build artifacts\n*.aux\n*.log\n*.out\n*.toc\n*.lof\n*.lot\n*.fls\n*.fdb_latexmk\n*.synctex.gz\n*.bbl\n*.blg\n*.nav\n*.snm\n*.vrb\n*.bcf\n*.run.xml\n\n# Output\n*.pdf\n\n# OS files\n.DS_Store\nThumbs.db\n\n# Git\n.git/\n\n# ClaudePrism internal\n.claudeprism/\n.prism/\n",
    "# LaTeX build artifacts\n*.aux\n*.log\n*.out\n*.toc\n*.lof\n*.lot\n*.fls\n*.fdb_latexmk\n*.synctex.gz\n*.bbl\n*.blg\n*.nav\n*.snm\n*.vrb\n*.bcf\n*.run.xml\n\n# Output\n*.pdf\n\n# OS files\n.DS_Store\nThumbs.db\n\n# Git\n.git/\n\n# ClaudePrism internal\n.claudeprism/\n",
];

/// Bring an excludes file to the current template version. Untouched old
/// templates are replaced; customised files keep the user's lines, lose only
/// a bare `*.pdf` line, and gain any missing current patterns.
fn migrate_excludes(existing: Option<&str>) -> Option<String> {
    let Some(existing) = existing else {
        return Some(EXCLUDES_CONTENT.to_string());
    };
    if existing == EXCLUDES_CONTENT || existing.starts_with(EXCLUDES_HEADER) {
        return None;
    }
    if PREVIOUS_EXCLUDES_TEMPLATES.contains(&existing) {
        return Some(EXCLUDES_CONTENT.to_string());
    }

    let kept: Vec<&str> = existing
        .lines()
        .filter(|line| line.trim() != "*.pdf")
        .collect();
    let present: std::collections::HashSet<&str> = kept.iter().map(|l| l.trim()).collect();
    let missing: Vec<&str> = EXCLUDES_CONTENT
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !present.contains(l))
        .collect();

    let mut out = format!("{}\n", EXCLUDES_HEADER);
    for line in kept {
        out.push_str(line);
        out.push('\n');
    }
    if !missing.is_empty() {
        out.push_str("\n# Added by AresPrism\n");
        for line in missing {
            out.push_str(line);
            out.push('\n');
        }
    }
    Some(out)
}

fn ensure_excludes(project_root: &str, repo: &Repository) {
    let excludes_path = Path::new(project_root)
        .join(".claudeprism")
        .join("history-exclude");
    let existing = fs::read_to_string(&excludes_path).ok();
    if let Some(updated) = migrate_excludes(existing.as_deref()) {
        let _ = fs::write(&excludes_path, updated);
    }
    // Configure the repo to use this excludes file
    if let Ok(mut config) = repo.config() {
        let _ = config.set_str("core.excludesFile", &excludes_path.to_string_lossy());
    }
}

/// Stage the whole working tree: new and modified files, deletions, and
/// nothing that looks like compiler output. A root-level `<name>.pdf` next to
/// `<name>.tex` is treated as output of an external TeX run, not a figure.
fn stage_worktree(repo: &Repository) -> Result<Index, String> {
    let mut index = repo
        .index()
        .map_err(|e| format!("Failed to get index: {}", e))?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Failed to add files: {}", e))?;
    // Drop entries whose files were deleted
    index
        .update_all(["*"].iter(), None)
        .map_err(|e| format!("Failed to stage deletions: {}", e))?;

    let workdir = repo.workdir().ok_or("No workdir")?.to_path_buf();
    let root_outputs: Vec<PathBuf> = index
        .iter()
        .filter_map(|entry| {
            let path = String::from_utf8_lossy(&entry.path).to_string();
            if path.contains('/') {
                return None;
            }
            let stem = path
                .strip_suffix(".pdf")
                .or_else(|| path.strip_suffix(".PDF"))?;
            workdir
                .join(format!("{}.tex", stem))
                .is_file()
                .then(|| PathBuf::from(&path))
        })
        .collect();
    for path in root_outputs {
        let _ = index.remove_path(&path);
    }

    index
        .write()
        .map_err(|e| format!("Failed to write index: {}", e))?;
    Ok(index)
}

fn changed_files_between(repo: &Repository, old: Option<&Tree>, new: &Tree) -> Vec<String> {
    repo.diff_tree_to_tree(old, Some(new), None)
        .map(|d| {
            d.deltas()
                .filter_map(|delta| {
                    delta
                        .new_file()
                        .path()
                        .or_else(|| delta.old_file().path())
                        .map(|p| p.to_string_lossy().to_string())
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

/// Commit the current working tree if it differs from HEAD.
fn snapshot_working_tree(
    repo: &Repository,
    message: &str,
    prune: bool,
) -> Result<Option<SnapshotInfo>, String> {
    let mut index = stage_worktree(repo)?;
    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("Failed to write tree: {}", e))?;

    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    // Check if there are actual changes vs HEAD
    if let Some(parent_commit) = parent.as_ref() {
        if parent_commit.tree().map(|t| t.id()).unwrap_or(Oid::zero()) == tree_oid {
            // No changes — skip snapshot
            return Ok(None);
        }
    }

    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("Failed to find tree: {}", e))?;

    let sig = default_signature()?;
    let parents: Vec<&git2::Commit> = parent.iter().collect();

    let oid = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            &commit_message(message),
            &tree,
            &parents,
        )
        .map_err(|e| format!("Failed to create commit: {}", e))?;

    // Collect changed file paths
    let changed_files = match parent.as_ref() {
        Some(parent_commit) => {
            let parent_tree = parent_commit.tree().ok();
            changed_files_between(repo, parent_tree.as_ref(), &tree)
        }
        None => vec![],
    };

    let id = if prune {
        prune_unlocked_snapshots(repo, UNLOCKED_SNAPSHOT_LIMIT)?.unwrap_or(oid)
    } else {
        oid
    };

    Ok(Some(SnapshotInfo {
        id: id.to_string(),
        parent_id: parent_id_of(repo, id),
        message: message.to_string(),
        timestamp: chrono::Utc::now().timestamp(),
        labels: vec![],
        changed_files,
    }))
}

const UNLOCKED_SNAPSHOT_LIMIT: usize = 50;

/// Drop oldest unlabeled commits so at most `keep_unlocked` unlabeled snapshots remain.
/// Commits with labels (locked versions) are always kept. The hidden history repo is
/// never pushed, so rewriting the linear history is safe.
fn prune_unlocked_snapshots(
    repo: &Repository,
    keep_unlocked: usize,
) -> Result<Option<Oid>, String> {
    let tags = raw_tag_map(repo);
    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("Failed to create revwalk: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("Failed to push HEAD: {}", e))?;
    // Default walk is newest-first along first-parent; TIME sort collapses
    // same-second test commits and would keep the init snapshot.

    let mut newest_first: Vec<Oid> = Vec::new();
    for oid_result in revwalk {
        newest_first.push(oid_result.map_err(|e| format!("Revwalk error: {}", e))?);
    }

    let mut unlocked_kept = 0usize;
    let mut keep_newest_first: Vec<Oid> = Vec::new();
    for oid in &newest_first {
        let locked = tags.contains_key(oid);
        if locked {
            keep_newest_first.push(*oid);
        } else if unlocked_kept < keep_unlocked {
            keep_newest_first.push(*oid);
            unlocked_kept += 1;
        }
    }

    if keep_newest_first.len() == newest_first.len() {
        return Ok(None);
    }

    let mut keep_oldest_first = keep_newest_first;
    keep_oldest_first.reverse();

    let mut oid_map: HashMap<Oid, Oid> = HashMap::new();
    let mut new_parent: Option<Oid> = None;

    for old_oid in &keep_oldest_first {
        let old_commit = repo
            .find_commit(*old_oid)
            .map_err(|e| format!("Failed to find commit: {}", e))?;
        let tree = old_commit
            .tree()
            .map_err(|e| format!("Failed to find tree: {}", e))?;
        let author = old_commit.author();
        let committer = old_commit.committer();
        let author_name = author.name().unwrap_or("ClaudePrism").to_string();
        let author_email = author
            .email()
            .unwrap_or("history@claudeprism.local")
            .to_string();
        let author_time = author.when();
        let committer_name = committer.name().unwrap_or("ClaudePrism").to_string();
        let committer_email = committer
            .email()
            .unwrap_or("history@claudeprism.local")
            .to_string();
        let committer_time = committer.when();
        let new_author = Signature::new(&author_name, &author_email, &author_time)
            .map_err(|e| format!("Failed to rebuild author: {}", e))?;
        let new_committer = Signature::new(&committer_name, &committer_email, &committer_time)
            .map_err(|e| format!("Failed to rebuild committer: {}", e))?;
        let message = old_commit.message().unwrap_or("").to_string();

        let parent_commit = match new_parent {
            Some(pid) => Some(
                repo.find_commit(pid)
                    .map_err(|e| format!("Failed to find rebuilt parent: {}", e))?,
            ),
            None => None,
        };
        let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

        let new_oid = repo
            .commit(None, &new_author, &new_committer, &message, &tree, &parents)
            .map_err(|e| format!("Failed to rebuild snapshot: {}", e))?;
        oid_map.insert(*old_oid, new_oid);
        new_parent = Some(new_oid);
    }

    let new_head = new_parent.ok_or_else(|| "Prune produced no commits".to_string())?;

    let head_ref = repo
        .head()
        .ok()
        .and_then(|h| h.name().map(|n| n.to_string()))
        .unwrap_or_else(|| "refs/heads/master".to_string());
    repo.reference(&head_ref, new_head, true, "prune unlocked snapshots")
        .map_err(|e| format!("Failed to move history HEAD: {}", e))?;

    for (old_oid, labels) in tags {
        let Some(&new_oid) = oid_map.get(&old_oid) else {
            continue;
        };
        let obj = repo
            .find_commit(new_oid)
            .map_err(|e| format!("Failed to find rebuilt commit: {}", e))?
            .into_object();
        for label in labels {
            let tag_ref = format!("refs/tags/{}", label);
            if let Ok(mut reference) = repo.find_reference(&tag_ref) {
                let _ = reference.delete();
            }
            repo.tag_lightweight(&label, &obj, true)
                .map_err(|e| format!("Failed to move lock label: {}", e))?;
        }
    }

    Ok(Some(new_head))
}

// ─── Tauri Commands ───
//
// Commands are async and run the git2 work on the blocking pool so the main
// thread never stalls. The `*_sync` functions hold the logic (and are what
// the unit tests call).

#[tauri::command]
pub async fn history_init(project_root: String) -> Result<(), String> {
    run_blocking(move || history_init_sync(project_root)).await
}

#[tauri::command]
pub async fn history_snapshot(
    project_root: String,
    message: String,
) -> Result<Option<SnapshotInfo>, String> {
    run_blocking(move || history_snapshot_sync(project_root, message)).await
}

#[tauri::command]
pub async fn history_list(
    project_root: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<SnapshotInfo>, String> {
    run_blocking(move || history_list_sync(project_root, limit, offset)).await
}

#[tauri::command]
pub async fn history_diff(
    project_root: String,
    from_id: Option<String>,
    to_id: String,
) -> Result<Vec<FileDiff>, String> {
    run_blocking(move || history_diff_sync(project_root, from_id, to_id)).await
}

#[tauri::command]
pub async fn history_file_at(
    project_root: String,
    snapshot_id: String,
    file_path: String,
) -> Result<String, String> {
    run_blocking(move || history_file_at_sync(project_root, snapshot_id, file_path)).await
}

#[tauri::command]
pub async fn history_restore(
    project_root: String,
    snapshot_id: String,
) -> Result<RestoreResult, String> {
    run_blocking(move || history_restore_sync(project_root, snapshot_id)).await
}

#[tauri::command]
pub async fn history_add_label(
    project_root: String,
    snapshot_id: String,
    label: String,
) -> Result<String, String> {
    run_blocking(move || history_add_label_sync(project_root, snapshot_id, label)).await
}

#[tauri::command]
pub async fn history_remove_label(project_root: String, label: String) -> Result<(), String> {
    run_blocking(move || history_remove_label_sync(project_root, label)).await
}

// ─── Command implementations ───

pub fn history_init_sync(project_root: String) -> Result<(), String> {
    let git_dir = history_path(&project_root);

    if git_dir.exists() {
        // Already initialized — verify and ensure excludes
        let repo =
            Repository::open(&git_dir).map_err(|e| format!("Corrupt history repo: {}", e))?;
        ensure_excludes(&project_root, &repo);
        return Ok(());
    }

    // Create .claudeprism/ dir
    let claudeprism_dir = Path::new(&project_root).join(".claudeprism");
    fs::create_dir_all(&claudeprism_dir)
        .map_err(|e| format!("Failed to create .claudeprism dir: {}", e))?;

    // Init a bare repo with workdir pointing to project root
    let mut opts = RepositoryInitOptions::new();
    opts.bare(false);
    opts.workdir_path(Path::new(&project_root));
    opts.no_reinit(true);

    let repo = Repository::init_opts(&git_dir, &opts)
        .map_err(|e| format!("Failed to init history repo: {}", e))?;

    // Set up excludes file
    ensure_excludes(&project_root, &repo);

    // Create initial commit with all project files
    let mut index = stage_worktree(&repo)?;
    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("Failed to write tree: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("Failed to find tree: {}", e))?;

    let sig = default_signature()?;
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &commit_message("[init] Project opened"),
        &tree,
        &[],
    )
    .map_err(|e| format!("Failed to create initial commit: {}", e))?;

    Ok(())
}

pub fn history_snapshot_sync(
    project_root: String,
    message: String,
) -> Result<Option<SnapshotInfo>, String> {
    let repo = open_repo(&project_root)?;
    snapshot_working_tree(&repo, &message, true)
}

pub fn history_list_sync(
    project_root: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<SnapshotInfo>, String> {
    let repo = open_repo(&project_root)?;
    let tags = tag_map(&repo);

    // Walk the first-parent chain from HEAD. Sorting by commit time would
    // misorder snapshots taken within the same second (e.g. "Before restore"
    // followed by the restore commit).
    let head = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| format!("Failed to read HEAD: {}", e))?;

    let mut snapshots = Vec::new();
    let mut count = 0u32;
    let mut next = Some(head);

    while let Some(commit) = next.take() {
        if snapshots.len() >= limit as usize {
            break;
        }
        next = commit.parent(0).ok();
        if count < offset {
            count += 1;
            continue;
        }
        let oid = commit.id();

        let message = display_message(commit.message().unwrap_or(""));
        let timestamp = commit.time().seconds();
        let labels = tags.get(&oid).cloned().unwrap_or_default();

        // Collect changed file paths (vs parent)
        let changed_files = match (commit.parents().next(), commit.tree().ok()) {
            (Some(parent), Some(new_tree)) => {
                let old_tree = parent.tree().ok();
                changed_files_between(&repo, old_tree.as_ref(), &new_tree)
            }
            _ => vec![],
        };

        snapshots.push(SnapshotInfo {
            id: oid.to_string(),
            parent_id: commit.parent_id(0).ok().map(|p| p.to_string()),
            message,
            timestamp,
            labels,
            changed_files,
        });

        count += 1;
    }

    Ok(snapshots)
}

/// Diff two snapshots. `from_id = None` diffs against an empty tree, so the
/// oldest snapshot shows every file as added.
pub fn history_diff_sync(
    project_root: String,
    from_id: Option<String>,
    to_id: String,
) -> Result<Vec<FileDiff>, String> {
    let repo = open_repo(&project_root)?;

    let from_tree = match from_id.as_deref() {
        Some(from_id) => {
            let from_oid = Oid::from_str(from_id).map_err(|e| format!("Invalid from_id: {}", e))?;
            let from_commit = repo
                .find_commit(from_oid)
                .map_err(|e| format!("Commit not found: {}", e))?;
            Some(
                from_commit
                    .tree()
                    .map_err(|e| format!("Tree error: {}", e))?,
            )
        }
        None => None,
    };

    let to_oid = Oid::from_str(&to_id).map_err(|e| format!("Invalid to_id: {}", e))?;
    let to_commit = repo
        .find_commit(to_oid)
        .map_err(|e| format!("Commit not found: {}", e))?;
    let to_tree = to_commit.tree().map_err(|e| format!("Tree error: {}", e))?;

    let mut diff_opts = DiffOptions::new();
    let diff = repo
        .diff_tree_to_tree(from_tree.as_ref(), Some(&to_tree), Some(&mut diff_opts))
        .map_err(|e| format!("Diff error: {}", e))?;

    let mut results = Vec::new();

    for delta in diff.deltas() {
        let file_path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Deleted => "deleted",
            _ => "modified",
        }
        .to_string();

        let old_content = if delta.status() != git2::Delta::Added {
            let old_blob = repo.find_blob(delta.old_file().id()).ok();
            old_blob.and_then(|b| {
                if b.is_binary() {
                    None
                } else {
                    Some(String::from_utf8_lossy(b.content()).to_string())
                }
            })
        } else {
            None
        };

        let new_content = if delta.status() != git2::Delta::Deleted {
            let new_blob = repo.find_blob(delta.new_file().id()).ok();
            new_blob.and_then(|b| {
                if b.is_binary() {
                    None
                } else {
                    Some(String::from_utf8_lossy(b.content()).to_string())
                }
            })
        } else {
            None
        };

        results.push(FileDiff {
            file_path,
            status,
            old_content,
            new_content,
        });
    }

    Ok(results)
}

pub fn history_file_at_sync(
    project_root: String,
    snapshot_id: String,
    file_path: String,
) -> Result<String, String> {
    let repo = open_repo(&project_root)?;
    let oid = Oid::from_str(&snapshot_id).map_err(|e| format!("Invalid snapshot_id: {}", e))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Commit not found: {}", e))?;
    let tree = commit.tree().map_err(|e| format!("Tree error: {}", e))?;
    let entry = tree
        .get_path(Path::new(&file_path))
        .map_err(|e| format!("File not found in snapshot: {}", e))?;
    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("Blob error: {}", e))?;

    if blob.is_binary() {
        return Err("Binary file".into());
    }

    Ok(String::from_utf8_lossy(blob.content()).to_string())
}

pub fn history_restore_sync(
    project_root: String,
    snapshot_id: String,
) -> Result<RestoreResult, String> {
    let repo = open_repo(&project_root)?;
    let oid = Oid::from_str(&snapshot_id).map_err(|e| format!("Invalid snapshot_id: {}", e))?;
    let target = repo
        .find_commit(oid)
        .map_err(|e| format!("Commit not found: {}", e))?;
    let target_tree = target.tree().map_err(|e| format!("Tree error: {}", e))?;

    // Save the current working tree first so the restore can be undone. No
    // prune here: the returned id must stay valid for the undo action.
    let previous_id = match snapshot_working_tree(&repo, "[auto] Before restore", false)? {
        Some(snapshot) => snapshot.id,
        None => repo
            .head()
            .and_then(|h| h.peel_to_commit())
            .map(|c| c.id().to_string())
            .map_err(|e| format!("History has no current version: {}", e))?,
    };
    let head_commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| format!("History has no current version: {}", e))?;
    let head_tree = head_commit
        .tree()
        .map_err(|e| format!("Tree error: {}", e))?;

    // Already at this version: do not create an empty restore commit.
    if head_tree.id() == target_tree.id() {
        return Ok(RestoreResult {
            snapshot: None,
            previous_id,
        });
    }

    // Checkout the tree to working directory. HEAD now matches the working
    // tree, so files that do not exist in the target are removed as well.
    repo.checkout_tree(
        target_tree.as_object(),
        Some(git2::build::CheckoutBuilder::new().force()),
    )
    .map_err(|e| format!("Checkout failed: {}", e))?;

    // A target taken under an older exclude template could not contain some
    // files (e.g. figure PDFs before v2). Their absence there does not mean
    // they were deleted, so put them back from the pre-restore version.
    let target_version = excludes_version_of(target.message().unwrap_or(""));
    if target_version < EXCLUDES_VERSION {
        keep_files_untracked_by_target(&repo, &head_tree, &target_tree, target_version)?;
    }

    // Create a new "restore" commit on HEAD (not moving HEAD to old commit)
    let mut index = stage_worktree(&repo)?;
    let new_tree_oid = index
        .write_tree()
        .map_err(|e| format!("Write tree error: {}", e))?;
    let new_tree = repo
        .find_tree(new_tree_oid)
        .map_err(|e| format!("Find tree error: {}", e))?;

    let sig = default_signature()?;
    // Full SHA so the target can always be identified (older entries used 8 chars).
    let msg = format!("[restore] Restored to {}", target.id());
    let new_oid = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            &commit_message(&msg),
            &new_tree,
            &[&head_commit],
        )
        .map_err(|e| format!("Commit error: {}", e))?;

    let changed_files = changed_files_between(&repo, Some(&head_tree), &new_tree);

    Ok(RestoreResult {
        snapshot: Some(SnapshotInfo {
            id: new_oid.to_string(),
            parent_id: Some(head_commit.id().to_string()),
            message: msg,
            timestamp: chrono::Utc::now().timestamp(),
            labels: vec![],
            changed_files,
        }),
        previous_id,
    })
}

/// Rewrite files from `current` that `target`'s exclude template could not
/// have recorded and that are absent from `target` (checkout deleted them).
fn keep_files_untracked_by_target(
    repo: &Repository,
    current: &Tree,
    target: &Tree,
    target_version: u32,
) -> Result<(), String> {
    let workdir = repo.workdir().ok_or("No workdir")?.to_path_buf();
    let mut to_keep: Vec<(String, Oid)> = Vec::new();
    current
        .walk(TreeWalkMode::PreOrder, |dir, entry| {
            if entry.kind() == Some(ObjectType::Blob) {
                if let Some(name) = entry.name() {
                    let path = format!("{}{}", dir, name);
                    if excluded_by_template(target_version, &path)
                        && target.get_path(Path::new(&path)).is_err()
                    {
                        to_keep.push((path, entry.id()));
                    }
                }
            }
            TreeWalkResult::Ok
        })
        .map_err(|e| format!("Tree walk failed: {}", e))?;

    for (path, blob_id) in to_keep {
        let blob = repo
            .find_blob(blob_id)
            .map_err(|e| format!("Blob error: {}", e))?;
        let full = workdir.join(&path);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to restore {}: {}", path, e))?;
        }
        fs::write(&full, blob.content())
            .map_err(|e| format!("Failed to restore {}: {}", path, e))?;
    }
    Ok(())
}

/// Returns the normalized display label that was stored.
pub fn history_add_label_sync(
    project_root: String,
    snapshot_id: String,
    label: String,
) -> Result<String, String> {
    let display = normalize_label(&label)?;
    let repo = open_repo(&project_root)?;
    let oid = Oid::from_str(&snapshot_id).map_err(|e| format!("Invalid snapshot_id: {}", e))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Commit not found: {}", e))?;

    if find_label_tag(&repo, &display).is_some() {
        return Err(format!("A version is already labeled \"{}\"", display));
    }

    repo.tag_lightweight(&encode_label(&display), commit.as_object(), false)
        .map_err(|e| format!("Failed to create label: {}", e))?;

    Ok(display)
}

pub fn history_remove_label_sync(project_root: String, label: String) -> Result<(), String> {
    let repo = open_repo(&project_root)?;
    let tag_name =
        find_label_tag(&repo, &label).ok_or_else(|| format!("Label not found: {}", label))?;
    let tag_ref = format!("refs/tags/{}", tag_name);
    repo.find_reference(&tag_ref)
        .map_err(|e| format!("Label not found: {}", e))?
        .delete()
        .map_err(|e| format!("Failed to delete label: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Create a temp project dir with the given files.
    fn setup_project(files: &[(&str, &str)]) -> TempDir {
        let dir = TempDir::new().unwrap();
        for (name, content) in files {
            let path = dir.path().join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, content).unwrap();
        }
        dir
    }

    fn root(dir: &TempDir) -> String {
        dir.path().to_string_lossy().to_string()
    }

    // ─── history_init ───

    #[test]
    fn test_history_init_creates_repo() {
        let dir = setup_project(&[("main.tex", "\\documentclass{article}")]);
        history_init_sync(root(&dir)).unwrap();

        let git_dir = dir.path().join(".claudeprism").join("history.git");
        assert!(git_dir.exists(), "history.git should be created");

        // Should have an initial commit
        let repo = Repository::open(&git_dir).unwrap();
        let head = repo.head().unwrap();
        let commit = head.peel_to_commit().unwrap();
        assert!(commit.message().unwrap().contains("[init]"));
    }

    #[test]
    fn test_history_init_idempotent() {
        let dir = setup_project(&[("main.tex", "hello")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        // Second call should succeed without error
        history_init_sync(r).unwrap();
    }

    #[test]
    fn test_history_init_creates_excludes() {
        let dir = setup_project(&[("main.tex", "doc")]);
        history_init_sync(root(&dir)).unwrap();

        let excludes = dir.path().join(".claudeprism").join("history-exclude");
        assert!(excludes.exists());
        let content = fs::read_to_string(&excludes).unwrap();
        assert!(content.contains("*.aux"));
        assert!(content.contains(".claudeprism/"));
        assert!(content.contains(".prism/"));
    }

    // ─── history_snapshot ───

    #[test]
    fn test_history_snapshot_after_modification() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        // Modify a file
        fs::write(dir.path().join("main.tex"), "v2").unwrap();

        let result = history_snapshot_sync(r, "edited main.tex".into()).unwrap();
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.message, "edited main.tex");
        assert!(snap.changed_files.contains(&"main.tex".to_string()));
    }

    #[test]
    fn test_history_snapshot_no_change_returns_none() {
        let dir = setup_project(&[("main.tex", "same")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        // No modification → None
        let result = history_snapshot_sync(r, "no-op".into()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_history_snapshot_detects_new_file() {
        let dir = setup_project(&[("main.tex", "doc")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        // Add a new file
        fs::write(dir.path().join("chapter1.tex"), "new chapter").unwrap();

        let snap = history_snapshot_sync(r, "add chapter".into())
            .unwrap()
            .unwrap();
        assert!(snap.changed_files.contains(&"chapter1.tex".to_string()));
    }

    // ─── history_list ───

    #[test]
    fn test_history_list_after_snapshots() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        fs::write(dir.path().join("main.tex"), "v2").unwrap();
        history_snapshot_sync(r.clone(), "snap 1".into()).unwrap();

        fs::write(dir.path().join("main.tex"), "v3").unwrap();
        history_snapshot_sync(r.clone(), "snap 2".into()).unwrap();

        let list = history_list_sync(r, 10, 0).unwrap();
        assert_eq!(list.len(), 3); // init + 2 snapshots
        let msgs: Vec<&str> = list.iter().map(|s| s.message.as_str()).collect();
        assert!(msgs.contains(&"snap 1"));
        assert!(msgs.contains(&"snap 2"));
        assert!(msgs.iter().any(|m| m.contains("[init]")));
    }

    #[test]
    fn test_history_list_pagination() {
        let dir = setup_project(&[("a.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        fs::write(dir.path().join("a.tex"), "y").unwrap();
        history_snapshot_sync(r.clone(), "s1".into()).unwrap();

        fs::write(dir.path().join("a.tex"), "z").unwrap();
        history_snapshot_sync(r.clone(), "s2".into()).unwrap();

        // limit=1 → returns exactly 1 entry
        let page1 = history_list_sync(r.clone(), 1, 0).unwrap();
        assert_eq!(page1.len(), 1);

        // offset=1 → returns a different entry
        let page2 = history_list_sync(r.clone(), 1, 1).unwrap();
        assert_eq!(page2.len(), 1);
        assert_ne!(page1[0].id, page2[0].id);

        // All 3 entries accessible
        let all = history_list_sync(r, 10, 0).unwrap();
        assert_eq!(all.len(), 3);
    }

    // ─── history_diff ───

    #[test]
    fn test_history_diff_shows_changes() {
        let dir = setup_project(&[("main.tex", "old content")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        fs::write(dir.path().join("main.tex"), "new content").unwrap();
        let snap = history_snapshot_sync(r.clone(), "update".into())
            .unwrap()
            .unwrap();

        let list = history_list_sync(r.clone(), 10, 0).unwrap();
        let from_id = list[1].id.clone(); // init
        let to_id = snap.id.clone();

        let diffs = history_diff_sync(r, Some(from_id), to_id).unwrap();
        assert!(!diffs.is_empty());
        let d = diffs.iter().find(|d| d.file_path == "main.tex").unwrap();
        assert_eq!(d.status, "modified");
        assert_eq!(d.old_content.as_deref(), Some("old content"));
        assert_eq!(d.new_content.as_deref(), Some("new content"));
    }

    #[test]
    fn test_history_diff_added_file() {
        let dir = setup_project(&[("a.tex", "a")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        fs::write(dir.path().join("b.tex"), "new file").unwrap();
        let snap = history_snapshot_sync(r.clone(), "add b".into())
            .unwrap()
            .unwrap();

        let list = history_list_sync(r.clone(), 10, 0).unwrap();
        let from_id = list[1].id.clone(); // init
        let to_id = snap.id;

        let diffs = history_diff_sync(r, Some(from_id), to_id).unwrap();
        let d = diffs.iter().find(|d| d.file_path == "b.tex").unwrap();
        assert_eq!(d.status, "added");
        assert!(d.old_content.is_none());
        assert_eq!(d.new_content.as_deref(), Some("new file"));
    }

    // ─── history_file_at ───

    #[test]
    fn test_history_file_at_returns_content() {
        let dir = setup_project(&[("main.tex", "version one")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        let init_id = list[0].id.clone();

        let content = history_file_at_sync(r, init_id, "main.tex".into()).unwrap();
        assert_eq!(content, "version one");
    }

    #[test]
    fn test_history_file_at_nonexistent_file_errors() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        let id = list[0].id.clone();

        let result = history_file_at_sync(r, id, "nonexistent.tex".into());
        assert!(result.is_err());
    }

    // ─── history_restore ───

    #[test]
    fn test_history_restore_reverts_content() {
        let dir = setup_project(&[("main.tex", "original")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        let init_id = list[0].id.clone();

        // Modify
        fs::write(dir.path().join("main.tex"), "modified").unwrap();
        history_snapshot_sync(r.clone(), "modify".into()).unwrap();

        // Restore to init
        let restore_info = history_restore_sync(r.clone(), init_id).unwrap();
        assert!(restore_info.snapshot.unwrap().message.contains("[restore]"));

        // Working directory should have original content
        let content = fs::read_to_string(dir.path().join("main.tex")).unwrap();
        assert_eq!(content, "original");
    }

    // ─── labels ───

    #[test]
    fn test_history_add_and_remove_label() {
        let dir = setup_project(&[("main.tex", "doc")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        let id = list[0].id.clone();

        // Add label
        history_add_label_sync(r.clone(), id.clone(), "v1.0".into()).unwrap();

        // Verify label appears in list
        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        assert!(list[0].labels.contains(&"v1.0".to_string()));

        // Remove label
        history_remove_label_sync(r.clone(), "v1.0".into()).unwrap();

        // Verify label gone
        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        assert!(!list[0].labels.contains(&"v1.0".to_string()));
    }

    #[test]
    fn test_history_remove_nonexistent_label_errors() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let result = history_remove_label_sync(r, "nope".into());
        assert!(result.is_err());
    }

    // ─── tag_map ───

    #[test]
    fn test_tag_map_groups_by_oid() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        let id = list[0].id.clone();

        history_add_label_sync(r.clone(), id.clone(), "alpha".into()).unwrap();
        history_add_label_sync(r.clone(), id.clone(), "beta".into()).unwrap();

        let repo = open_repo(&r).unwrap();
        let map = tag_map(&repo);
        let oid = Oid::from_str(&id).unwrap();
        let labels = map.get(&oid).unwrap();
        assert!(labels.contains(&"alpha".to_string()));
        assert!(labels.contains(&"beta".to_string()));
    }

    // ─── ensure_excludes ───

    #[test]
    fn test_ensure_excludes_migrates_missing_prism() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        // Write an excludes file WITHOUT .prism/
        let excludes_path = dir.path().join(".claudeprism").join("history-exclude");
        fs::write(&excludes_path, "*.aux\n*.log\n.claudeprism/\n").unwrap();

        let repo = open_repo(&r).unwrap();
        ensure_excludes(&r, &repo);

        let content = fs::read_to_string(&excludes_path).unwrap();
        assert!(
            content.contains(".prism/"),
            "should migrate to include .prism/"
        );
    }

    // ─── edge cases ───

    #[test]
    fn test_history_snapshot_deleted_file() {
        let dir = setup_project(&[("a.tex", "aaa"), ("b.tex", "bbb")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        // Delete a file
        fs::remove_file(dir.path().join("b.tex")).unwrap();

        let snap = history_snapshot_sync(r.clone(), "delete b".into())
            .unwrap()
            .unwrap();
        assert!(!snap.changed_files.is_empty());
    }

    #[test]
    fn test_history_diff_deleted_file() {
        let dir = setup_project(&[("a.tex", "keep"), ("b.tex", "remove me")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        let init_id = list[0].id.clone();

        fs::remove_file(dir.path().join("b.tex")).unwrap();
        let snap = history_snapshot_sync(r.clone(), "delete b".into())
            .unwrap()
            .unwrap();

        let diffs = history_diff_sync(r, Some(init_id), snap.id).unwrap();
        let d = diffs.iter().find(|d| d.file_path == "b.tex").unwrap();
        assert_eq!(d.status, "deleted");
        assert_eq!(d.old_content.as_deref(), Some("remove me"));
        assert!(d.new_content.is_none());
    }

    #[test]
    fn test_history_diff_nonadjacent_snapshots() {
        let dir = setup_project(&[("a.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list0 = history_list_sync(r.clone(), 1, 0).unwrap();
        let init_id = list0[0].id.clone();

        fs::write(dir.path().join("a.tex"), "v2").unwrap();
        history_snapshot_sync(r.clone(), "s1".into()).unwrap();

        fs::write(dir.path().join("a.tex"), "v3").unwrap();
        let snap3 = history_snapshot_sync(r.clone(), "s2".into())
            .unwrap()
            .unwrap();

        // Diff from init directly to s2 (skipping s1)
        let diffs = history_diff_sync(r, Some(init_id), snap3.id).unwrap();
        let d = diffs.iter().find(|d| d.file_path == "a.tex").unwrap();
        assert_eq!(d.old_content.as_deref(), Some("v1"));
        assert_eq!(d.new_content.as_deref(), Some("v3"));
    }

    #[test]
    fn test_history_add_duplicate_label_errors() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        let id = list[0].id.clone();

        history_add_label_sync(r.clone(), id.clone(), "dup".into()).unwrap();
        // Adding same label again should error
        let result = history_add_label_sync(r, id, "dup".into());
        assert!(result.is_err());
    }

    #[test]
    fn test_history_restore_creates_restore_commit() {
        let dir = setup_project(&[("main.tex", "original")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let init_list = history_list_sync(r.clone(), 1, 0).unwrap();
        let init_id = init_list[0].id.clone();

        fs::write(dir.path().join("main.tex"), "changed").unwrap();
        history_snapshot_sync(r.clone(), "change".into()).unwrap();

        history_restore_sync(r.clone(), init_id).unwrap();

        // Should now have 3 entries: init, change, restore (the working tree was
        // already snapshotted, so no "[auto] Before restore" entry)
        let list = history_list_sync(r, 10, 0).unwrap();
        assert_eq!(list.len(), 3);
        assert!(list.iter().any(|s| s.message.contains("[restore]")));
    }

    // ─── prune unlocked snapshots ───

    #[test]
    fn test_prune_drops_oldest_unlocked_over_limit() {
        let dir = setup_project(&[("main.tex", "v0")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        for i in 1..=6 {
            fs::write(dir.path().join("main.tex"), format!("v{i}")).unwrap();
            history_snapshot_sync(r.clone(), format!("s{i}")).unwrap();
        }

        let repo = open_repo(&r).unwrap();
        prune_unlocked_snapshots(&repo, 3).unwrap();

        let list = history_list_sync(r, 20, 0).unwrap();
        assert_eq!(
            list.len(),
            3,
            "unlocked cap is 3, got {:?}",
            list.iter().map(|s| s.message.clone()).collect::<Vec<_>>()
        );
        assert!(list.iter().any(|s| s.message == "s6"));
        assert!(list.iter().all(|s| s.message != "[init] Project opened"));
    }

    #[test]
    fn test_prune_keeps_locked_beyond_unlocked_cap() {
        let dir = setup_project(&[("main.tex", "v0")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        history_add_label_sync(r.clone(), init_id, "keep-me".into()).unwrap();

        for i in 1..=6 {
            fs::write(dir.path().join("main.tex"), format!("v{i}")).unwrap();
            history_snapshot_sync(r.clone(), format!("s{i}")).unwrap();
        }

        let repo = open_repo(&r).unwrap();
        prune_unlocked_snapshots(&repo, 3).unwrap();

        let list = history_list_sync(r, 20, 0).unwrap();
        assert!(
            list.iter().any(|s| s.labels.iter().any(|l| l == "keep-me")),
            "locked init must survive prune: {:?}",
            list.iter()
                .map(|s| (s.message.clone(), s.labels.clone()))
                .collect::<Vec<_>>()
        );
        let unlocked = list.iter().filter(|s| s.labels.is_empty()).count();
        assert_eq!(unlocked, 3);
    }

    // ─── restore safety ───

    #[test]
    fn test_restore_snapshots_dirty_tree_and_undo_restores_it() {
        let dir = setup_project(&[("main.tex", "v1"), ("old.tex", "old")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();

        // Unsnapshotted edits: modify, add, delete
        fs::write(dir.path().join("main.tex"), "unsaved work").unwrap();
        fs::write(dir.path().join("new.tex"), "brand new").unwrap();
        fs::remove_file(dir.path().join("old.tex")).unwrap();

        let result = history_restore_sync(r.clone(), init_id.clone()).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("main.tex")).unwrap(),
            "v1"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("old.tex")).unwrap(),
            "old"
        );
        assert!(
            !dir.path().join("new.tex").exists(),
            "file absent in the target version should be removed"
        );

        let list = history_list_sync(r.clone(), 10, 0).unwrap();
        let before = list
            .iter()
            .find(|s| s.message == "[auto] Before restore")
            .expect("pre-restore snapshot must exist");
        assert_eq!(before.id, result.previous_id);

        // Undo: restore to the pre-restore snapshot
        history_restore_sync(r.clone(), result.previous_id.clone()).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("main.tex")).unwrap(),
            "unsaved work"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("new.tex")).unwrap(),
            "brand new"
        );
        assert!(!dir.path().join("old.tex").exists());
    }

    #[test]
    fn test_restore_clean_tree_returns_head_as_previous() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        fs::write(dir.path().join("main.tex"), "v2").unwrap();
        let snap = history_snapshot_sync(r.clone(), "s".into())
            .unwrap()
            .unwrap();

        let result = history_restore_sync(r.clone(), init_id).unwrap();
        assert_eq!(result.previous_id, snap.id);
        let list = history_list_sync(r, 10, 0).unwrap();
        assert!(list.iter().all(|s| s.message != "[auto] Before restore"));
    }

    #[test]
    fn test_restore_message_carries_full_sha() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        fs::write(dir.path().join("main.tex"), "v2").unwrap();
        history_snapshot_sync(r.clone(), "s".into()).unwrap();

        let result = history_restore_sync(r, init_id.clone()).unwrap();
        assert_eq!(init_id.len(), 40);
        assert_eq!(
            result.snapshot.as_ref().unwrap().message,
            format!("[restore] Restored to {}", init_id)
        );
        assert!(result
            .snapshot
            .unwrap()
            .changed_files
            .contains(&"main.tex".to_string()));
    }

    // ─── label encoding ───

    #[test]
    fn test_label_encoding_roundtrip() {
        for label in [
            "submission draft",
            "Draft v1",
            "投稿版 第二稿",
            "a/b:c?*[x]~^",
            "l-zz",
        ] {
            let encoded = encode_label(label);
            assert!(
                git2::Reference::is_valid_name(&format!("refs/tags/{}", encoded)),
                "{encoded} must be a valid ref"
            );
            assert_eq!(decode_label(&encoded), label);
        }
        // Legacy tags are shown verbatim
        assert_eq!(decode_label("v1.0"), "v1.0");
        assert_eq!(decode_label("l-xyz"), "l-xyz");
        assert_eq!(decode_label("l-6869"), "l-6869");
        assert_eq!(decode_label("ap-label/zz"), "ap-label/zz");
        // Decoded control characters are not trusted
        assert_eq!(decode_label("ap-label/0a"), "ap-label/0a");
        assert!(encode_label("x").starts_with("ap-label/"));
    }

    #[test]
    fn test_label_validation() {
        assert!(normalize_label("   ").is_err());
        assert_eq!(normalize_label("  Draft v1 ").unwrap(), "Draft v1");
        assert!(normalize_label(&"x".repeat(81)).is_err());
        assert!(normalize_label(&"x".repeat(80)).is_ok());
        assert!(normalize_label("a\nb").is_err());
    }

    #[test]
    fn test_labels_with_spaces_and_chinese_roundtrip_and_survive_prune() {
        let dir = setup_project(&[("main.tex", "v0")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();

        let stored =
            history_add_label_sync(r.clone(), init_id.clone(), "  submission draft ".into())
                .unwrap();
        assert_eq!(stored, "submission draft");
        history_add_label_sync(r.clone(), init_id.clone(), "投稿版".into()).unwrap();

        // Duplicate display name is rejected with a readable error
        let dup = history_add_label_sync(r.clone(), init_id.clone(), "投稿版".into());
        assert!(dup.unwrap_err().contains("already labeled"));

        for i in 1..=6 {
            fs::write(dir.path().join("main.tex"), format!("v{i}")).unwrap();
            history_snapshot_sync(r.clone(), format!("s{i}")).unwrap();
        }
        let repo = open_repo(&r).unwrap();
        assert!(prune_unlocked_snapshots(&repo, 2).unwrap().is_some());

        let list = history_list_sync(r.clone(), 20, 0).unwrap();
        let locked = list
            .iter()
            .find(|s| s.message == "[init] Project opened")
            .expect("labeled init must survive prune");
        assert!(locked.labels.contains(&"submission draft".to_string()));
        assert!(locked.labels.contains(&"投稿版".to_string()));

        history_remove_label_sync(r.clone(), "投稿版".into()).unwrap();
        let list = history_list_sync(r, 20, 0).unwrap();
        let locked = list
            .iter()
            .find(|s| s.message == "[init] Project opened")
            .unwrap();
        assert_eq!(locked.labels, vec!["submission draft".to_string()]);
    }

    #[test]
    fn test_legacy_label_listed_and_removable() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        let repo = open_repo(&r).unwrap();
        let commit = repo.find_commit(Oid::from_str(&id).unwrap()).unwrap();
        repo.tag_lightweight("legacy-v1", commit.as_object(), false)
            .unwrap();

        let list = history_list_sync(r.clone(), 1, 0).unwrap();
        assert_eq!(list[0].labels, vec!["legacy-v1".to_string()]);
        assert!(history_add_label_sync(r.clone(), id, "legacy-v1".into()).is_err());
        history_remove_label_sync(r.clone(), "legacy-v1".into()).unwrap();
        assert!(history_list_sync(r, 1, 0).unwrap()[0].labels.is_empty());
    }

    // ─── excludes / PDFs ───

    #[test]
    fn test_figure_pdfs_are_versioned() {
        let dir = setup_project(&[
            ("main.tex", "doc"),
            ("figures/plot.pdf", "%PDF-1.5 figure"),
            ("main.pdf", "%PDF-1.5 output"),
        ]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        let excludes =
            fs::read_to_string(dir.path().join(".claudeprism").join("history-exclude")).unwrap();
        assert!(!excludes.contains("*.pdf"));
        assert!(excludes.contains(".prism/"));

        let id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        assert_eq!(
            history_file_at_sync(r.clone(), id.clone(), "figures/plot.pdf".into()).unwrap(),
            "%PDF-1.5 figure"
        );
        // Root-level <main>.pdf next to <main>.tex is compiler output
        assert!(history_file_at_sync(r, id, "main.pdf".into()).is_err());
    }

    #[test]
    fn test_ensure_excludes_rewrites_old_template() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();

        // Old template (with .prism/ already present) still excluded *.pdf
        let excludes_path = dir.path().join(".claudeprism").join("history-exclude");
        fs::write(&excludes_path, PREVIOUS_EXCLUDES_TEMPLATES[0]).unwrap();
        fs::write(dir.path().join("fig.pdf"), "%PDF fig").unwrap();
        fs::write(dir.path().join("main.tex"), "y").unwrap();
        let snap = history_snapshot_sync(r.clone(), "old".into())
            .unwrap()
            .unwrap();
        assert!(!snap.changed_files.contains(&"fig.pdf".to_string()));

        // Re-opening the project migrates the excludes file
        history_init_sync(r.clone()).unwrap();
        let content = fs::read_to_string(&excludes_path).unwrap();
        assert_eq!(content, EXCLUDES_CONTENT);
        assert!(!content.contains("*.pdf"));

        let snap = history_snapshot_sync(r, "new".into()).unwrap().unwrap();
        assert_eq!(snap.changed_files, vec!["fig.pdf".to_string()]);
    }

    // ─── diff against empty tree ───

    #[test]
    fn test_history_diff_without_parent_shows_all_added() {
        let dir = setup_project(&[("main.tex", "doc")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        let diffs = history_diff_sync(r, None, id).unwrap();
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, "added");
        assert_eq!(diffs[0].new_content.as_deref(), Some("doc"));
    }
    // ─── review fixes ───

    /// Commit the current tree with a fixed timestamp, like several snapshots
    /// taken within the same second.
    fn commit_same_second(repo: &Repository, message: &str) -> Oid {
        let mut index = stage_worktree(repo).unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let time = git2::Time::new(1_700_000_000, 0);
        let sig = Signature::new("ClaudePrism", "history@claudeprism.local", &time).unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &commit_message(message),
            &tree,
            &[&parent],
        )
        .unwrap()
    }

    #[test]
    fn test_list_same_second_commits_in_chain_order_with_parent_ids() {
        let dir = setup_project(&[("main.tex", "v0")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let repo = open_repo(&r).unwrap();
        let init = repo.head().unwrap().peel_to_commit().unwrap().id();

        let mut chain = vec![init];
        for i in 1..=4 {
            fs::write(dir.path().join("main.tex"), format!("v{i}")).unwrap();
            chain.push(commit_same_second(&repo, &format!("c{i}")));
        }

        let list = history_list_sync(r.clone(), 10, 0).unwrap();
        let ids: Vec<String> = list.iter().map(|s| s.id.clone()).collect();
        let expected: Vec<String> = chain.iter().rev().map(|o| o.to_string()).collect();
        assert_eq!(ids, expected);
        let msgs: Vec<&str> = list.iter().map(|s| s.message.as_str()).collect();
        assert_eq!(
            msgs,
            vec!["c4", "c3", "c2", "c1", "[init] Project opened"],
            "trailer must not leak into messages"
        );
        for pair in list.windows(2) {
            assert_eq!(pair[0].parent_id.as_deref(), Some(pair[1].id.as_str()));
        }
        assert_eq!(list.last().unwrap().parent_id, None);

        // Pagination follows the same chain
        let page = history_list_sync(r, 2, 2).unwrap();
        assert_eq!(
            page.iter().map(|s| s.id.clone()).collect::<Vec<_>>(),
            expected[2..4].to_vec()
        );
    }

    #[test]
    fn test_restore_lists_before_restore_then_restore_in_order() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        fs::write(dir.path().join("main.tex"), "dirty").unwrap();

        let result = history_restore_sync(r.clone(), init_id).unwrap();
        let snapshot = result.snapshot.unwrap();
        let list = history_list_sync(r, 10, 0).unwrap();
        assert_eq!(list[0].id, snapshot.id);
        assert_eq!(list[1].id, result.previous_id);
        assert_eq!(
            list[0].parent_id.as_deref(),
            Some(result.previous_id.as_str())
        );
        assert_eq!(
            snapshot.parent_id.as_deref(),
            Some(result.previous_id.as_str())
        );
    }

    #[test]
    fn test_snapshot_parent_id_and_trailer() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        fs::write(dir.path().join("main.tex"), "v2").unwrap();
        let snap = history_snapshot_sync(r.clone(), "[auto] Edit".into())
            .unwrap()
            .unwrap();
        assert_eq!(snap.parent_id.as_deref(), Some(init_id.as_str()));
        assert_eq!(snap.message, "[auto] Edit");

        let repo = open_repo(&r).unwrap();
        let raw = repo
            .find_commit(Oid::from_str(&snap.id).unwrap())
            .unwrap()
            .message()
            .unwrap()
            .to_string();
        assert_eq!(excludes_version_of(&raw), EXCLUDES_VERSION);
        assert_eq!(excludes_version_of("[auto] Edit"), 1);
        assert_eq!(display_message("[auto] Edit"), "[auto] Edit");
    }

    #[test]
    fn test_restore_to_pre_migration_snapshot_keeps_figure_pdfs() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let repo = open_repo(&r).unwrap();

        // A v1-era snapshot: no trailer, taken when PDFs were excluded.
        fs::write(dir.path().join("main.tex"), "old era").unwrap();
        let mut index = stage_worktree(&repo).unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let sig = default_signature().unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        let old_id = repo
            .commit(Some("HEAD"), &sig, &sig, "[auto] Edit", &tree, &[&parent])
            .unwrap()
            .to_string();

        // Now the figure is tracked under the v2 template
        fs::create_dir_all(dir.path().join("figures")).unwrap();
        fs::write(dir.path().join("figures/plot.pdf"), "%PDF figure").unwrap();
        fs::write(dir.path().join("main.tex"), "new era").unwrap();
        history_snapshot_sync(r.clone(), "[auto] Edit".into())
            .unwrap()
            .unwrap();

        let result = history_restore_sync(r.clone(), old_id).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("main.tex")).unwrap(),
            "old era"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("figures/plot.pdf")).unwrap(),
            "%PDF figure",
            "figure PDF must survive restoring a pre-migration version"
        );
        let restore_id = result.snapshot.unwrap().id;
        assert_eq!(
            history_file_at_sync(r, restore_id, "figures/plot.pdf".into()).unwrap(),
            "%PDF figure"
        );
    }

    #[test]
    fn test_restore_to_v2_snapshot_still_removes_pdfs_it_lacks() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let init_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();
        fs::write(dir.path().join("fig.pdf"), "%PDF").unwrap();
        history_snapshot_sync(r.clone(), "add fig".into()).unwrap();

        history_restore_sync(r, init_id).unwrap();
        assert!(!dir.path().join("fig.pdf").exists());
    }

    #[test]
    fn test_restore_to_current_version_is_noop() {
        let dir = setup_project(&[("main.tex", "v1")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let head_id = history_list_sync(r.clone(), 1, 0).unwrap()[0].id.clone();

        let result = history_restore_sync(r.clone(), head_id.clone()).unwrap();
        assert!(result.snapshot.is_none());
        assert_eq!(result.previous_id, head_id);
        assert_eq!(history_list_sync(r, 10, 0).unwrap().len(), 1);
    }

    #[test]
    fn test_customised_excludes_are_preserved_on_migration() {
        let custom = "*.aux\n*.pdf\nmy-data/\n# keep me\n";
        let migrated = migrate_excludes(Some(custom)).unwrap();
        assert!(migrated.starts_with(EXCLUDES_HEADER));
        assert!(migrated.contains("my-data/"));
        assert!(migrated.contains("# keep me"));
        assert!(!migrated.lines().any(|l| l.trim() == "*.pdf"));
        assert!(migrated.contains(".prism/"));
        assert!(migrated.contains(".claudeprism/"));
        assert_eq!(migrated.matches("*.aux").count(), 1);
        // Already migrated (custom v2 file) is left alone
        assert!(migrate_excludes(Some(&migrated)).is_none());
        // Untouched old templates are replaced by the canonical file
        for old in PREVIOUS_EXCLUDES_TEMPLATES {
            assert_eq!(migrate_excludes(Some(old)).unwrap(), EXCLUDES_CONTENT);
        }
        assert!(migrate_excludes(Some(EXCLUDES_CONTENT)).is_none());
        assert_eq!(migrate_excludes(None).unwrap(), EXCLUDES_CONTENT);
    }

    #[test]
    fn test_customised_excludes_file_migrated_on_open() {
        let dir = setup_project(&[("main.tex", "x")]);
        let r = root(&dir);
        history_init_sync(r.clone()).unwrap();
        let excludes_path = dir.path().join(".claudeprism").join("history-exclude");
        fs::write(&excludes_path, "*.pdf\nscratch/\n").unwrap();
        history_init_sync(r).unwrap();
        let content = fs::read_to_string(&excludes_path).unwrap();
        assert!(content.contains("scratch/"));
        assert!(!content.lines().any(|l| l.trim() == "*.pdf"));
    }
}
