//! Local CLI AgentPort: spawn Codex / Grok Build / Kimi Code like Claude Code.
//!
//! stdout is normalized to Claude Code stream-json so the existing
//! `claude-output` / `use-claude-events` path can render the chat.

use crate::claude_process::spawn_streaming_process;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::WebviewWindow;
use tokio::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const LATEX_HINT: &str = "You are running inside AresPrism, a local LaTeX IDE. Prefer small, targeted edits to existing .tex files. Do not rewrite whole files. Preserve the preamble, packages, and document structure.\n\n";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentKind {
    Claude,
    Codex,
    Grok,
    Kimi,
}

impl AgentKind {
    pub const ALL: [AgentKind; 4] = [
        AgentKind::Claude,
        AgentKind::Codex,
        AgentKind::Grok,
        AgentKind::Kimi,
    ];

    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "claude" | "claude-code" => Ok(AgentKind::Claude),
            "codex" | "codex-cli" => Ok(AgentKind::Codex),
            "grok" | "grok-build" => Ok(AgentKind::Grok),
            "kimi" | "kimi-code" => Ok(AgentKind::Kimi),
            other => Err(format!(
                "Unknown agent '{other}'. Use claude, codex, grok, or kimi."
            )),
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            AgentKind::Claude => "claude",
            AgentKind::Codex => "codex",
            AgentKind::Grok => "grok",
            AgentKind::Kimi => "kimi",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            AgentKind::Claude => "Claude Code",
            AgentKind::Codex => "Codex",
            AgentKind::Grok => "Grok Build",
            AgentKind::Kimi => "Kimi Code",
        }
    }

    pub fn binary(self) -> &'static str {
        match self {
            AgentKind::Claude => "claude",
            AgentKind::Codex => "codex",
            AgentKind::Grok => "grok",
            AgentKind::Kimi => "kimi",
        }
    }
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentBinaryStatus {
    pub id: String,
    pub label: String,
    pub binary: String,
    pub installed: bool,
    pub authenticated: bool,
    pub ready: bool,
    pub detail: String,
    pub binary_path: Option<String>,
    pub version: Option<String>,
}

#[tauri::command]
pub async fn check_agents_status() -> Result<Vec<AgentBinaryStatus>, String> {
    Ok(AgentKind::ALL.iter().copied().map(agent_status).collect())
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentModelInfo {
    pub id: String,
    pub label: String,
}

#[tauri::command]
pub async fn list_agent_models(agent: String) -> Result<Vec<AgentModelInfo>, String> {
    let kind = AgentKind::parse(&agent)?;
    Ok(list_models_for(kind))
}

#[tauri::command]
pub async fn execute_agent(
    window: WebviewWindow,
    project_path: String,
    prompt: String,
    tab_id: String,
    agent: String,
    session_id: Option<String>,
    model: Option<String>,
    effort_level: Option<String>,
) -> Result<(), String> {
    let kind = AgentKind::parse(&agent)?;
    if kind == AgentKind::Claude {
        return crate::claude::execute_claude_code(
            window,
            project_path,
            prompt,
            tab_id,
            model,
            None,
            None,
            None,
        )
        .await;
    }

    let binary = find_cli_binary(kind).ok_or_else(|| {
        format!(
            "{} CLI (`{}`) is not installed.",
            kind.label(),
            kind.binary()
        )
    })?;

    let prompt = format!("{LATEX_HINT}{prompt}");
    let resume = session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let args = build_cli_args(
        kind,
        &project_path,
        &prompt,
        resume,
        model.as_deref(),
        effort_level.as_deref(),
    );
    let cmd = create_agent_command(&binary, args, &project_path);
    let mapper = match kind {
        AgentKind::Codex => map_codex_line as fn(&str) -> Vec<String>,
        AgentKind::Grok | AgentKind::Kimi => map_compatible_line as fn(&str) -> Vec<String>,
        AgentKind::Claude => unreachable!(),
    };

    spawn_streaming_process(window, cmd, tab_id, None, None, Some(mapper)).await
}

fn agent_status(kind: AgentKind) -> AgentBinaryStatus {
    let path = find_cli_binary(kind);
    let version = path.as_deref().and_then(read_version);
    let installed = path.is_some();
    let authenticated = kind == AgentKind::Claude || is_cli_authenticated(kind);
    let (ready, detail) = if !installed {
        (false, format!("`{}` not found", kind.binary()))
    } else if !authenticated {
        (false, "installed, not signed in".to_string())
    } else {
        (
            true,
            version.clone().unwrap_or_else(|| "signed in".to_string()),
        )
    };
    AgentBinaryStatus {
        id: kind.id().to_string(),
        label: kind.label().to_string(),
        binary: kind.binary().to_string(),
        installed,
        authenticated,
        ready,
        detail,
        binary_path: path,
        version,
    }
}

fn is_cli_authenticated(kind: AgentKind) -> bool {
    let Some(home) = dirs::home_dir() else {
        return false;
    };
    match kind {
        AgentKind::Claude => true,
        AgentKind::Codex => home.join(".codex").join("auth.json").exists(),
        AgentKind::Grok => home.join(".grok").join("auth.json").exists(),
        AgentKind::Kimi => {
            let kimi = home.join(".kimi");
            kimi.join("kimi.json").exists()
                || kimi.join("auth.json").exists()
                || kimi.join("credentials.json").exists()
        }
    }
}

fn map_effort(kind: AgentKind, effort: Option<&str>) -> String {
    let value = effort.unwrap_or("").trim();
    match kind {
        AgentKind::Kimi => {
            if matches!(
                value,
                "thinking" | "high" | "medium" | "xhigh" | "ultra" | "max"
            ) {
                "thinking".into()
            } else {
                "no-thinking".into()
            }
        }
        AgentKind::Grok => match value {
            "low" | "high" | "xhigh" => value.to_string(),
            _ => "medium".into(),
        },
        AgentKind::Codex => match value {
            "low" | "high" | "xhigh" | "ultra" | "max" => value.to_string(),
            _ => "medium".into(),
        },
        AgentKind::Claude => match value {
            "low" | "high" => value.to_string(),
            _ => "medium".into(),
        },
    }
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentEffortInfo {
    pub id: String,
    pub label: String,
}

#[tauri::command]
pub async fn list_agent_efforts(agent: String) -> Result<Vec<AgentEffortInfo>, String> {
    let kind = AgentKind::parse(&agent)?;
    Ok(list_efforts_for(kind))
}

fn list_efforts_for(kind: AgentKind) -> Vec<AgentEffortInfo> {
    match kind {
        AgentKind::Claude => ["low", "medium", "high"]
            .into_iter()
            .map(|id| AgentEffortInfo {
                id: id.to_string(),
                label: id.to_string(),
            })
            .collect(),
        AgentKind::Grok => ["low", "medium", "high", "xhigh"]
            .into_iter()
            .map(|id| AgentEffortInfo {
                id: id.to_string(),
                label: id.to_string(),
            })
            .collect(),
        AgentKind::Kimi => vec![
            AgentEffortInfo {
                id: "no-thinking".into(),
                label: "Off".into(),
            },
            AgentEffortInfo {
                id: "thinking".into(),
                label: "Thinking".into(),
            },
        ],
        AgentKind::Codex => {
            let from_config = read_codex_effort_list();
            let ids = if from_config.is_empty() {
                vec![
                    "low".into(),
                    "medium".into(),
                    "high".into(),
                    "xhigh".into(),
                    "ultra".into(),
                    "max".into(),
                ]
            } else {
                from_config
            };
            ids.into_iter()
                .map(|id| AgentEffortInfo {
                    label: id.clone(),
                    id,
                })
                .collect()
        }
    }
}

fn read_codex_effort_list() -> Vec<String> {
    let text = std::fs::read_to_string(codex_config_path()).unwrap_or_default();
    let Some(start) = text.find("enabled-reasoning-efforts") else {
        return Vec::new();
    };
    let rest = &text[start..];
    let Some(open) = rest.find('[') else {
        return Vec::new();
    };
    let Some(close) = rest[open..].find(']') else {
        return Vec::new();
    };
    rest[open + 1..open + close]
        .lines()
        .filter_map(|line| {
            let value = line.trim().trim_end_matches(',').trim_matches('"');
            if value.is_empty() || value.starts_with('#') {
                None
            } else {
                Some(value.to_string())
            }
        })
        .collect()
}

fn list_models_for(kind: AgentKind) -> Vec<AgentModelInfo> {
    match kind {
        AgentKind::Claude => ["sonnet", "opus", "haiku", "opusplan"]
            .into_iter()
            .map(|id| AgentModelInfo {
                id: id.to_string(),
                label: id.to_string(),
            })
            .collect(),
        AgentKind::Codex => {
            if !is_cli_authenticated(kind) {
                Vec::new()
            } else {
                probe_codex_models()
            }
        }
        AgentKind::Grok => {
            if !is_cli_authenticated(kind) {
                Vec::new()
            } else {
                find_cli_binary(kind)
                    .and_then(|path| probe_grok_models(&path))
                    .unwrap_or_default()
            }
        }
        AgentKind::Kimi => {
            if !is_cli_authenticated(kind) {
                Vec::new()
            } else {
                read_kimi_models()
            }
        }
    }
}

/// Coding models advertised by the installed Codex CLI (not ChatGPT image/audio).
const CODEX_CLI_MODELS: &[&str] = &[
    "gpt-6-astra",
    "gpt-5.6",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-pro",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.2",
    "gpt-5.1-codex-max",
];

fn probe_codex_models() -> Vec<AgentModelInfo> {
    let mut models = Vec::new();
    let mut push = |id: String| {
        if id.is_empty() || models.iter().any(|item: &AgentModelInfo| item.id == id) {
            return;
        }
        models.push(AgentModelInfo {
            label: id.clone(),
            id,
        });
    };
    if let Some(configured) = read_toml_key(&codex_config_path(), "model") {
        push(configured);
    }
    for id in read_all_toml_keys(&codex_config_path(), "model") {
        push(id);
    }
    for id in CODEX_CLI_MODELS {
        push((*id).to_string());
    }
    models
}

fn read_all_toml_keys(path: &Path, key: &str) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') {
            continue;
        }
        let Some((left, right)) = trimmed.split_once('=') else {
            continue;
        };
        if left.trim() != key {
            continue;
        }
        let value = right.trim().trim_matches('"').trim_matches('\'').trim();
        if !value.is_empty() {
            values.push(value.to_string());
        }
    }
    values
}

fn codex_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".codex")
        .join("config.toml")
}

fn read_toml_key(path: &Path, key: &str) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') {
            continue;
        }
        let Some((left, right)) = trimmed.split_once('=') else {
            continue;
        };
        if left.trim() != key {
            continue;
        }
        let value = right.trim().trim_matches('"').trim_matches('\'').trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

fn probe_grok_models(binary: &str) -> Option<Vec<AgentModelInfo>> {
    let output = std::process::Command::new(binary)
        .arg("models")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim().trim_start_matches(['*', '-', '•']).trim();
        if trimmed.is_empty() || trimmed.contains(' ') && !trimmed.contains("grok-") {
            if let Some(id) = trimmed
                .split_whitespace()
                .find(|part| part.starts_with("grok-"))
            {
                let id =
                    id.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '.');
                if !id.is_empty() && !models.iter().any(|item: &AgentModelInfo| item.id == id) {
                    models.push(AgentModelInfo {
                        id: id.to_string(),
                        label: id.to_string(),
                    });
                }
            }
            continue;
        }
        if trimmed.starts_with("grok-") {
            let id = trimmed
                .split_whitespace()
                .next()
                .unwrap_or(trimmed)
                .trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '.');
            if !id.is_empty() && !models.iter().any(|item| item.id == id) {
                models.push(AgentModelInfo {
                    id: id.to_string(),
                    label: id.to_string(),
                });
            }
        }
    }
    if models.is_empty() {
        None
    } else {
        Some(models)
    }
}

fn read_kimi_models() -> Vec<AgentModelInfo> {
    let path = dirs::home_dir()
        .unwrap_or_default()
        .join(".kimi")
        .join("config.toml");
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut models = Vec::new();
    if let Some(default) = read_toml_key_from_text(&text, "default_model") {
        models.push(AgentModelInfo {
            id: default.clone(),
            label: default,
        });
    }
    for cap in text.split("[models.\"").skip(1) {
        if let Some(id) = cap.split('"').next() {
            if id.is_empty() || models.iter().any(|item| item.id == id) {
                continue;
            }
            // Kimi Code's picker should only show Kimi models, not every
            // extra provider alias sitting in the same config file.
            if !id.to_ascii_lowercase().contains("kimi") {
                continue;
            }
            models.push(AgentModelInfo {
                id: id.to_string(),
                label: id.to_string(),
            });
        }
    }
    models
}

fn read_toml_key_from_text(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim();
        let Some((left, right)) = trimmed.split_once('=') else {
            continue;
        };
        if left.trim() == key {
            let value = right.trim().trim_matches('"').trim_matches('\'').trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn build_cli_args(
    kind: AgentKind,
    project_path: &str,
    prompt: &str,
    session_id: Option<&str>,
    model: Option<&str>,
    effort: Option<&str>,
) -> Vec<String> {
    let mut args = Vec::new();
    let effort = map_effort(kind, effort);
    match kind {
        AgentKind::Claude => unreachable!(),
        AgentKind::Codex => {
            args.push("exec".into());
            if let Some(session) = session_id {
                args.push("resume".into());
                args.push(session.to_string());
            }
            args.extend([
                "--json".into(),
                "--skip-git-repo-check".into(),
                "--dangerously-bypass-approvals-and-sandbox".into(),
                "-c".into(),
                format!("model_reasoning_effort=\"{effort}\""),
            ]);
            if session_id.is_none() {
                args.push("-C".into());
                args.push(project_path.to_string());
            }
            if let Some(model) = model.filter(|value| !value.is_empty()) {
                args.push("-m".into());
                args.push(model.to_string());
            }
            args.push(prompt.to_string());
        }
        AgentKind::Grok => {
            args.extend([
                "--always-approve".into(),
                "--permission-mode".into(),
                "bypassPermissions".into(),
                "--output-format".into(),
                "streaming-messages-json".into(),
                "--cwd".into(),
                project_path.to_string(),
                "--reasoning-effort".into(),
                effort.to_string(),
            ]);
            if let Some(session) = session_id {
                args.push("--resume".into());
                args.push(session.to_string());
            }
            if let Some(model) = model.filter(|value| !value.is_empty()) {
                args.push("-m".into());
                args.push(model.to_string());
            }
            args.push("-p".into());
            args.push(prompt.to_string());
        }
        AgentKind::Kimi => {
            args.extend([
                "--print".into(),
                "--output-format".into(),
                "stream-json".into(),
                "-y".into(),
                "-w".into(),
                project_path.to_string(),
            ]);
            args.push(if effort == "thinking" {
                "--thinking".into()
            } else {
                "--no-thinking".into()
            });
            if let Some(session) = session_id {
                args.push("-r".into());
                args.push(session.to_string());
            }
            if let Some(model) = model.filter(|value| !value.is_empty()) {
                args.push("-m".into());
                args.push(model.to_string());
            }
            args.push("-p".into());
            args.push(prompt.to_string());
        }
    }
    args
}

fn find_cli_binary(kind: AgentKind) -> Option<String> {
    let name = kind.binary();
    for candidate in extra_binary_candidates(kind) {
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    if let Ok(path) = which::which(name) {
        return Some(path.to_string_lossy().to_string());
    }
    #[cfg(not(target_os = "windows"))]
    if let Some(path) = login_which(name) {
        if PathBuf::from(&path).exists() {
            return Some(path);
        }
    }
    for dir in extra_path_dirs() {
        let candidate = dir.join(binary_filename(name));
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

fn extra_binary_candidates(kind: AgentKind) -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    match kind {
        AgentKind::Grok => vec![home.join(".grok").join("bin").join(binary_filename("grok"))],
        AgentKind::Kimi => vec![home
            .join(".local")
            .join("bin")
            .join(binary_filename("kimi"))],
        AgentKind::Codex => vec![
            PathBuf::from("/opt/homebrew/bin").join(binary_filename("codex")),
            PathBuf::from("/usr/local/bin").join(binary_filename("codex")),
        ],
        AgentKind::Claude => vec![home
            .join(".local")
            .join("bin")
            .join(binary_filename("claude"))],
    }
}

fn extra_path_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Some(home) = dirs::home_dir() {
        dirs.extend([
            home.join(".local").join("bin"),
            home.join(".grok").join("bin"),
            home.join(".cargo").join("bin"),
            home.join(".bun").join("bin"),
        ]);
    }
    dirs
}

fn binary_filename(name: &str) -> String {
    #[cfg(windows)]
    {
        format!("{name}.exe")
    }
    #[cfg(not(windows))]
    {
        name.to_string()
    }
}

#[cfg(not(target_os = "windows"))]
fn login_which(name: &str) -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = std::process::Command::new(&shell)
        .args(["-l", "-c", &format!("command -v {name}")])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn read_version(path: &str) -> Option<String> {
    let output = std::process::Command::new(path)
        .arg("--version")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        None
    } else {
        Some(line.to_string())
    }
}

fn create_agent_command(program: &str, args: Vec<String>, cwd: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(&args);
    cmd.current_dir(cwd);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut current_path = std::env::var("PATH").unwrap_or_default();
    if let Some(dir) = Path::new(program).parent() {
        let dir = dir.to_string_lossy();
        if !current_path.split(sep).any(|part| part == dir) {
            current_path = format!("{dir}{sep}{current_path}");
        }
    }
    for dir in extra_path_dirs() {
        if dir.exists() {
            let dir = dir.to_string_lossy();
            if !current_path.split(sep).any(|part| part == dir) {
                current_path = format!("{dir}{sep}{current_path}");
            }
        }
    }
    cmd.env("PATH", current_path);
    cmd
}

pub(crate) fn map_compatible_line(line: &str) -> Vec<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
        return vec![assistant_text(trimmed)];
    };
    match value.get("type").and_then(Value::as_str) {
        Some("assistant" | "user" | "system" | "result") => vec![trimmed.to_string()],
        Some("text") => value
            .get("data")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(assistant_text)
            .into_iter()
            .collect(),
        Some("thought") => value
            .get("data")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(assistant_thinking)
            .into_iter()
            .collect(),
        Some("error") => {
            let message = value
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Agent error");
            vec![result_event(false, message)]
        }
        Some("end") => {
            let session_id = value.get("sessionId").and_then(Value::as_str);
            let mut events = Vec::new();
            if let Some(session_id) = session_id {
                events.push(system_init(session_id));
            }
            events.push(result_event(true, ""));
            events
        }
        _ => Vec::new(),
    }
}

pub(crate) fn map_codex_line(line: &str) -> Vec<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
        return Vec::new();
    };
    match value.get("type").and_then(Value::as_str) {
        Some("thread.started") => value
            .get("thread_id")
            .and_then(Value::as_str)
            .map(system_init)
            .into_iter()
            .collect(),
        Some("turn.completed") => vec![result_event(true, "")],
        Some("turn.failed") => {
            let message = value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Codex turn failed");
            vec![result_event(false, message)]
        }
        Some("error") => {
            let message = value.get("message").and_then(Value::as_str).unwrap_or("");
            let lower = message.to_ascii_lowercase();
            if lower.starts_with("reconnecting") || lower.contains("additional input from stdin") {
                Vec::new()
            } else if message.is_empty() {
                vec![result_event(false, "Codex error")]
            } else {
                vec![result_event(false, message)]
            }
        }
        Some("item.completed") => map_codex_item(value.get("item").unwrap_or(&Value::Null)),
        _ => Vec::new(),
    }
}

fn map_codex_item(item: &Value) -> Vec<String> {
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
    let id = item.get("id").and_then(Value::as_str).unwrap_or("item");
    match item_type {
        "agent_message" => item
            .get("text")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(assistant_text)
            .into_iter()
            .collect(),
        "reasoning" => item
            .get("text")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(assistant_thinking)
            .into_iter()
            .collect(),
        "command_execution" => {
            let command = item.get("command").and_then(Value::as_str).unwrap_or("");
            let output = item
                .get("aggregated_output")
                .and_then(Value::as_str)
                .unwrap_or("");
            let failed = item.get("status").and_then(Value::as_str) == Some("failed")
                || item.get("exit_code").and_then(Value::as_i64).unwrap_or(0) != 0;
            vec![
                tool_use(id, "Bash", json!({ "command": command })),
                tool_result(id, output, failed),
            ]
        }
        "file_change" => {
            let changes = item.get("changes").and_then(Value::as_array);
            let failed = item.get("status").and_then(Value::as_str) == Some("failed");
            let mut events = Vec::new();
            if let Some(changes) = changes {
                for (index, change) in changes.iter().enumerate() {
                    let path = change.get("path").and_then(Value::as_str).unwrap_or("");
                    if path.is_empty() {
                        continue;
                    }
                    let tool_id = format!("{id}-{index}");
                    events.push(tool_use(&tool_id, "Write", json!({ "file_path": path })));
                    events.push(tool_result(&tool_id, path, failed));
                }
            }
            events
        }
        "web_search" => {
            let query = item.get("query").and_then(Value::as_str).unwrap_or("");
            vec![
                tool_use(id, "WebSearch", json!({ "query": query })),
                tool_result(id, query, false),
            ]
        }
        "mcp_tool_call" => {
            let tool = item.get("tool").and_then(Value::as_str).unwrap_or("mcp");
            let failed = item.get("status").and_then(Value::as_str) == Some("failed");
            let args = item.get("arguments").cloned().unwrap_or(json!({}));
            vec![tool_use(id, tool, args), tool_result(id, tool, failed)]
        }
        _ => Vec::new(),
    }
}

fn assistant_text(text: &str) -> String {
    json!({
        "type": "assistant",
        "message": { "content": [{ "type": "text", "text": text }] }
    })
    .to_string()
}

fn assistant_thinking(text: &str) -> String {
    json!({
        "type": "assistant",
        "message": { "content": [{ "type": "thinking", "thinking": text }] }
    })
    .to_string()
}

fn system_init(session_id: &str) -> String {
    json!({
        "type": "system",
        "subtype": "init",
        "session_id": session_id
    })
    .to_string()
}

fn result_event(success: bool, message: &str) -> String {
    json!({
        "type": "result",
        "subtype": if success { "success" } else { "error" },
        "is_error": !success,
        "result": message
    })
    .to_string()
}

fn tool_use(id: &str, name: &str, input: Value) -> String {
    json!({
        "type": "assistant",
        "message": {
            "content": [{
                "type": "tool_use",
                "id": id,
                "name": name,
                "input": input
            }]
        }
    })
    .to_string()
}

fn tool_result(id: &str, content: &str, is_error: bool) -> String {
    json!({
        "type": "user",
        "message": {
            "content": [{
                "type": "tool_result",
                "tool_use_id": id,
                "content": content,
                "is_error": is_error
            }]
        }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_agent_aliases() {
        assert_eq!(AgentKind::parse("Codex").unwrap(), AgentKind::Codex);
        assert_eq!(AgentKind::parse("grok-build").unwrap(), AgentKind::Grok);
        assert_eq!(AgentKind::parse("kimi-code").unwrap(), AgentKind::Kimi);
        assert!(AgentKind::parse("opencode").is_err());
    }

    #[test]
    fn codex_new_args_include_workspace_and_json() {
        let args = build_cli_args(AgentKind::Codex, "/paper", "fix tex", None, None, None);
        assert_eq!(args[0], "exec");
        assert!(args.contains(&"--json".into()));
        assert!(args.contains(&"--skip-git-repo-check".into()));
        assert!(args
            .iter()
            .any(|arg| arg.contains("model_reasoning_effort")));
        assert!(args.contains(&"-C".into()));
        assert!(args.contains(&"/paper".into()));
        assert_eq!(args.last().unwrap(), "fix tex");
        assert!(!args.contains(&"resume".into()));
    }

    #[test]
    fn codex_resume_args_use_session_id() {
        let args = build_cli_args(
            AgentKind::Codex,
            "/paper",
            "continue",
            Some("thread-1"),
            Some("gpt-5"),
            Some("high"),
        );
        assert_eq!(args[0], "exec");
        assert_eq!(args[1], "resume");
        assert_eq!(args[2], "thread-1");
        assert!(args.contains(&"-m".into()));
        assert!(args.contains(&"gpt-5".into()));
        assert!(!args.contains(&"-C".into()));
    }

    #[test]
    fn grok_args_are_headless() {
        let args = build_cli_args(
            AgentKind::Grok,
            "/paper",
            "hello",
            Some("abc"),
            None,
            Some("medium"),
        );
        assert!(args.contains(&"--always-approve".into()));
        assert!(args.contains(&"streaming-messages-json".into()));
        assert!(args.contains(&"--reasoning-effort".into()));
        assert!(args.contains(&"--resume".into()));
        assert!(args.contains(&"abc".into()));
        assert!(args.contains(&"-p".into()));
    }

    #[test]
    fn kimi_args_print_stream_json() {
        let args = build_cli_args(AgentKind::Kimi, "/paper", "hello", None, None, Some("low"));
        assert!(args.contains(&"--print".into()));
        assert!(args.contains(&"stream-json".into()));
        assert!(args.contains(&"--no-thinking".into()));
        assert!(args.contains(&"-y".into()));
        assert!(args.contains(&"-w".into()));
        assert!(args.contains(&"-p".into()));
    }

    #[test]
    fn map_codex_thread_and_message() {
        let init = map_codex_line(
            r#"{"type":"thread.started","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}"#,
        );
        assert_eq!(init.len(), 1);
        let value: Value = serde_json::from_str(&init[0]).unwrap();
        assert_eq!(value["type"], "system");
        assert_eq!(value["session_id"], "0199a213-81c0-7800-8aa1-bbab2a035a53");

        let msg = map_codex_line(
            r#"{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Done."}}"#,
        );
        let value: Value = serde_json::from_str(&msg[0]).unwrap();
        assert_eq!(value["type"], "assistant");
        assert_eq!(value["message"]["content"][0]["text"], "Done.");
    }

    #[test]
    fn map_codex_file_change_to_write_tools() {
        let events = map_codex_line(
            r#"{"type":"item.completed","item":{"id":"item_4","type":"file_change","changes":[{"path":"main.tex","kind":"update"}],"status":"completed"}}"#,
        );
        assert_eq!(events.len(), 2);
        let tool: Value = serde_json::from_str(&events[0]).unwrap();
        assert_eq!(tool["message"]["content"][0]["name"], "Write");
        assert_eq!(
            tool["message"]["content"][0]["input"]["file_path"],
            "main.tex"
        );
        let result: Value = serde_json::from_str(&events[1]).unwrap();
        assert_eq!(result["type"], "user");
        assert_eq!(result["message"]["content"][0]["type"], "tool_result");
    }

    #[test]
    fn map_codex_ignores_reconnect_errors() {
        let events = map_codex_line(r#"{"type":"error","message":"Reconnecting... 1/5"}"#);
        assert!(events.is_empty());
    }

    #[test]
    fn map_codex_ignores_stdin_prompt() {
        let events = map_codex_line(
            r#"{"type":"error","message":"Reading additional input from stdin..."}"#,
        );
        assert!(events.is_empty());
    }

    #[test]
    fn map_compatible_passthrough_and_grok_text() {
        let passthrough = map_compatible_line(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}"#,
        );
        assert_eq!(passthrough.len(), 1);
        let grok = map_compatible_line(r#"{"type":"text","data":"Here's a summary"}"#);
        let value: Value = serde_json::from_str(&grok[0]).unwrap();
        assert_eq!(value["message"]["content"][0]["text"], "Here's a summary");
    }
}
