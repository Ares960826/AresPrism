use git2::{DiffOptions, Repository, RepositoryOpenFlags, Signature, StatusOptions};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Debug)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct GitCommitInfo {
    pub id: String,
    pub message: String,
    pub timestamp: i64,
}

/// Open only the repository rooted at the project folder. `discover` would walk
/// up into a parent repository and let "Commit" stage an entire parent tree.
fn open_repo(project_root: &str) -> Result<Repository, String> {
    let root = Path::new(project_root);
    let repo = Repository::open_ext(
        root,
        RepositoryOpenFlags::NO_SEARCH,
        std::iter::empty::<&std::ffi::OsStr>(),
    )
    .map_err(|e| format!("No git repository: {e}"))?;
    let same_root = match (repo.workdir(), root.canonicalize()) {
        (Some(workdir), Ok(root)) => workdir.canonicalize().is_ok_and(|w| w == root),
        _ => false,
    };
    if !same_root {
        return Err("No git repository: project folder is not a repository root".into());
    }
    Ok(repo)
}

/// Commit signature from the repo/global git config, else a local fallback.
fn commit_signature(repo: &Repository) -> Result<Signature<'static>, String> {
    match repo.signature() {
        Ok(sig) => Ok(sig.to_owned()),
        Err(_) => Signature::now("AresPrism", "aresprism@local").map_err(|e| e.to_string()),
    }
}

/// Serializes Git panel operations so concurrent commands cannot race on the
/// repository index lock.
static GIT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = GIT_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        task()
    })
    .await
    .map_err(|e| format!("Git task failed: {e}"))?
}

// Commands are async and run the git2 work on the blocking pool so the main
// thread never stalls. The `*_sync` functions hold the logic.

#[tauri::command]
pub async fn git_init(project_root: String) -> Result<(), String> {
    run_blocking(move || git_init_sync(project_root)).await
}

#[tauri::command]
pub async fn git_status(project_root: String) -> Result<Vec<GitFileStatus>, String> {
    run_blocking(move || git_status_sync(project_root)).await
}

#[tauri::command]
pub async fn git_diff_file(project_root: String, path: String) -> Result<String, String> {
    run_blocking(move || git_diff_file_sync(project_root, path)).await
}

#[tauri::command]
pub async fn git_commit(project_root: String, message: String) -> Result<String, String> {
    run_blocking(move || git_commit_sync(project_root, message)).await
}

#[tauri::command]
pub async fn git_log(project_root: String) -> Result<Vec<GitCommitInfo>, String> {
    run_blocking(move || git_log_sync(project_root)).await
}

pub fn git_init_sync(project_root: String) -> Result<(), String> {
    let path = Path::new(&project_root);
    if path.join(".git").exists() {
        return Ok(());
    }
    Repository::init(path).map_err(|e| format!("Failed to initialize git repository: {e}"))?;
    Ok(())
}

pub fn git_status_sync(project_root: String) -> Result<Vec<GitFileStatus>, String> {
    let repo = open_repo(&project_root)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        if path.is_empty() {
            continue;
        }
        let st = entry.status();
        let label = if st.is_conflicted() {
            "conflict"
        } else if st.is_wt_deleted() || st.is_index_deleted() {
            "deleted"
        } else if st.is_wt_new() || st.is_index_new() {
            "untracked"
        } else {
            "modified"
        };
        files.push(GitFileStatus {
            path,
            status: label.into(),
        });
    }
    Ok(files)
}

pub fn git_diff_file_sync(project_root: String, path: String) -> Result<String, String> {
    let repo = open_repo(&project_root)?;
    let mut opts = DiffOptions::new();
    opts.pathspec(&path);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.to_string())?;
    let mut out = String::new();
    diff.print(git2::DiffFormat::Patch, |_d, _h, line| {
        let origin = line.origin();
        if origin == '+' || origin == '-' || origin == ' ' || origin == '@' {
            out.push(origin);
        }
        out.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })
    .map_err(|e| e.to_string())?;
    Ok(out)
}

pub fn git_commit_sync(project_root: String, message: String) -> Result<String, String> {
    let repo = open_repo(&project_root)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    // Stage deletions too
    index
        .update_all(["*"].iter(), None)
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    let sig = commit_signature(&repo)?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parent_refs: Vec<&git2::Commit> = match &parent {
        Some(commit) => vec![commit],
        None => vec![],
    };
    let oid = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            message.trim(),
            &tree,
            &parent_refs,
        )
        .map_err(|e| e.to_string())?;
    Ok(oid.to_string())
}

pub fn git_log_sync(project_root: String) -> Result<Vec<GitCommitInfo>, String> {
    let repo = open_repo(&project_root)?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    let mut commits = Vec::new();
    for oid in revwalk.take(50).flatten() {
        if let Ok(commit) = repo.find_commit(oid) {
            commits.push(GitCommitInfo {
                id: oid.to_string(),
                message: commit.summary().unwrap_or("").to_string(),
                timestamp: commit.time().seconds(),
            });
        }
    }
    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_git_init_creates_repo() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("main.tex"), "x").unwrap();
        let root = dir.path().to_string_lossy().to_string();
        git_init_sync(root.clone()).unwrap();
        assert!(dir.path().join(".git").exists());
        git_init_sync(root).unwrap();
        assert!(dir.path().join(".git").exists());
    }

    #[test]
    fn test_git_status_errors_without_repo() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        assert!(git_status_sync(root).is_err());
    }

    #[test]
    fn test_project_nested_in_parent_repo_has_no_repo() {
        let parent = TempDir::new().unwrap();
        Repository::init(parent.path()).unwrap();
        let project = parent.path().join("paper");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("main.tex"), "x").unwrap();
        let root = project.to_string_lossy().to_string();

        let err = git_status_sync(root.clone()).unwrap_err();
        assert!(err.to_lowercase().contains("no git repository"), "{err}");
        assert!(git_commit_sync(root.clone(), "should not commit".into()).is_err());

        // Initializing then makes the project its own repository
        git_init_sync(root.clone()).unwrap();
        assert!(git_status_sync(root).is_ok());
    }

    #[test]
    fn test_git_commit_records_deletions() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.tex"), "a").unwrap();
        fs::write(dir.path().join("b.tex"), "b").unwrap();
        let root = dir.path().to_string_lossy().to_string();
        git_init_sync(root.clone()).unwrap();
        git_commit_sync(root.clone(), "first".into()).unwrap();

        fs::remove_file(dir.path().join("b.tex")).unwrap();
        let id = git_commit_sync(root.clone(), "delete b".into()).unwrap();

        let repo = Repository::open(dir.path()).unwrap();
        let tree = repo
            .find_commit(git2::Oid::from_str(&id).unwrap())
            .unwrap()
            .tree()
            .unwrap();
        assert!(tree.get_name("a.tex").is_some());
        assert!(
            tree.get_name("b.tex").is_none(),
            "deletion must be committed"
        );
        assert!(git_status_sync(root).unwrap().is_empty());
    }
}
