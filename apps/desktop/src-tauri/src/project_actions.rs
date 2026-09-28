use std::path::{Path, PathBuf};
fn project_directory(path: &str) -> Result<PathBuf, String> {
    let original = Path::new(path);
    if !original.is_absolute() || original.parent().is_none() {
        return Err("Choose a project directory".into());
    }
    if original
        .symlink_metadata()
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Project must not be a symbolic link".into());
    }
    let path = original.canonicalize().map_err(|e| e.to_string())?;
    if !path.is_dir() || path.parent().is_none() {
        return Err("Choose a project directory".into());
    }
    if let Some(home) = dirs::home_dir() {
        if home.starts_with(&path)
            || ["Documents", "Desktop", "Downloads", "Library"]
                .iter()
                .any(|name| path == home.join(name))
        {
            return Err("This directory is not an individual project".into());
        }
    }
    if [
        "/Applications",
        "/System",
        "/Library",
        "/Users",
        "/Volumes",
        "/private",
        "/usr",
        "/bin",
        "/etc",
    ]
    .iter()
    .any(|root| path == Path::new(root))
    {
        return Err("System directories cannot be removed".into());
    }
    Ok(path)
}
#[tauri::command]
pub fn reveal_project(path: String) -> Result<(), String> {
    let path = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status();
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let status = std::process::Command::new("xdg-open").arg(&path).status();
    let status = status.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Unable to reveal project".into())
    }
}
#[tauri::command]
pub async fn trash_project(path: String) -> Result<(), String> {
    let path = project_directory(&path)?;
    tokio::task::spawn_blocking(move || trash::delete(path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_root_home_and_links() {
        assert!(project_directory("/").is_err());
        assert!(project_directory(".").is_err());
        assert!(project_directory(&dirs::home_dir().unwrap().to_string_lossy()).is_err());
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir(&project).unwrap();
        assert!(project_directory(&project.to_string_lossy()).is_ok());
        #[cfg(unix)]
        {
            let link = dir.path().join("link");
            std::os::unix::fs::symlink(&project, &link).unwrap();
            assert!(project_directory(&link.to_string_lossy()).is_err());
        }
    }
}
