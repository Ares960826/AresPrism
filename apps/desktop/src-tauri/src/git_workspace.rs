use git2::{DiffOptions, Repository, Signature, StatusOptions};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
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

fn open_repo(project_root: &str) -> Result<Repository, String> {
    Repository::discover(Path::new(project_root)).map_err(|e| format!("No git repository: {e}"))
}

#[tauri::command]
pub fn git_init(project_root: String) -> Result<(), String> {
    let path = Path::new(&project_root);
    if path.join(".git").exists() {
        return Ok(());
    }
    Repository::init(path).map_err(|e| format!("Failed to initialize git repository: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn git_status(project_root: String) -> Result<Vec<GitFileStatus>, String> {
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

#[tauri::command]
pub fn git_diff_file(project_root: String, path: String) -> Result<String, String> {
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

#[tauri::command]
pub fn git_commit(project_root: String, message: String) -> Result<String, String> {
    let repo = open_repo(&project_root)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    let sig = Signature::now("AresPrism", "aresprism@local").map_err(|e| e.to_string())?;
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

#[tauri::command]
pub fn git_log(project_root: String) -> Result<Vec<GitCommitInfo>, String> {
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
        git_init(root.clone()).unwrap();
        assert!(dir.path().join(".git").exists());
        git_init(root).unwrap();
        assert!(dir.path().join(".git").exists());
    }

    #[test]
    fn test_git_status_errors_without_repo() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        assert!(git_status(root).is_err());
    }
}
