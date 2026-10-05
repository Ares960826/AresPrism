//! Model choices for the Claude Code CLI.
//!
//! Claude Code accepts aliases (`fable`, `opus`, `sonnet`, ...) that always
//! point at the newest model of a family, plus full model ids. The picker lists
//! the aliases, adds any alias the installed CLI advertises in `--help`, the
//! models pinned in `~/.claude/settings.json`, and — when an Anthropic API key
//! is configured — the ids the Models API reports for that key.

use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ClaudeModelOption {
    pub id: String,
    pub label: String,
    pub description: String,
}

const BUILTIN_ALIASES: &[(&str, &str, &str)] = &[
    ("default", "Default", "Your account's recommended model"),
    ("fable", "Fable", "Newest Fable model, most capable"),
    ("opus", "Opus", "Newest Opus model, complex reasoning"),
    ("sonnet", "Sonnet", "Newest Sonnet model, fast and capable"),
    ("haiku", "Haiku", "Newest Haiku model, fastest"),
    (
        "opusplan",
        "OpusPlan",
        "Opus while planning, Sonnet while executing",
    ),
    ("fable[1m]", "Fable 1M", "Fable with 1M-token context"),
    ("opus[1m]", "Opus 1M", "Opus with 1M-token context"),
    ("sonnet[1m]", "Sonnet 1M", "Sonnet with 1M-token context"),
];

fn option(id: &str, label: &str, description: &str) -> ClaudeModelOption {
    ClaudeModelOption {
        id: id.to_string(),
        label: label.to_string(),
        description: description.to_string(),
    }
}

pub fn builtin_aliases() -> Vec<ClaudeModelOption> {
    BUILTIN_ALIASES
        .iter()
        .map(|(id, label, description)| option(id, label, description))
        .collect()
}

fn alias_label(alias: &str) -> String {
    let (base, long) = match alias.strip_suffix("[1m]") {
        Some(base) => (base, true),
        None => (alias, false),
    };
    let mut chars = base.chars();
    let name = match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    };
    if long {
        format!("{name} 1M")
    } else {
        name
    }
}

/// Aliases quoted in the `--model` help text, e.g. `'fable', 'opus', or 'sonnet'`.
pub fn aliases_from_help(help: &str) -> Vec<String> {
    let mut lines = help.lines().skip_while(|line| !line.contains("--model"));
    let mut text = String::new();
    if let Some(first) = lines.next() {
        text.push_str(first);
    }
    // The description continues on indented lines until the next option.
    for line in lines {
        if line.trim_start().starts_with('-') {
            break;
        }
        text.push(' ');
        text.push_str(line.trim());
    }
    let mut aliases = Vec::new();
    let mut rest = text.as_str();
    while let Some(start) = rest.find('\'') {
        let after = &rest[start + 1..];
        let Some(end) = after.find('\'') else { break };
        let candidate = &after[..end];
        if !candidate.is_empty()
            && candidate.len() <= 24
            && candidate
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "[]-".contains(c))
            && !aliases.iter().any(|a| a == candidate)
        {
            aliases.push(candidate.to_string());
        }
        rest = &after[end + 1..];
    }
    aliases
}

/// `model` and `availableModels` from a Claude Code settings.json.
pub fn models_from_settings(settings: &Value) -> Vec<String> {
    let mut models = Vec::new();
    if let Some(model) = settings.get("model").and_then(Value::as_str) {
        models.push(model.to_string());
    }
    if let Some(list) = settings.get("availableModels").and_then(Value::as_array) {
        models.extend(list.iter().filter_map(Value::as_str).map(str::to_string));
    }
    models
        .into_iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect()
}

/// `data[].{id, display_name}` from `GET /v1/models`.
pub fn models_from_api(body: &Value) -> Vec<ClaudeModelOption> {
    body.get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?;
                    let label = item
                        .get("display_name")
                        .and_then(Value::as_str)
                        .unwrap_or(id);
                    Some(option(id, label, id))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn push_unique(list: &mut Vec<ClaudeModelOption>, item: ClaudeModelOption) {
    if !list.iter().any(|existing| existing.id == item.id) {
        list.push(item);
    }
}

async fn help_aliases() -> Vec<String> {
    let Ok(binary) = crate::claude::find_claude_binary() else {
        return Vec::new();
    };
    let mut cmd = tokio::process::Command::new(&binary);
    cmd.arg("--help")
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    if let Some(dir) = std::path::Path::new(&binary).parent() {
        let path = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![dir.to_path_buf()];
        paths.extend(std::env::split_paths(&path));
        if let Ok(joined) = std::env::join_paths(paths) {
            cmd.env("PATH", joined);
        }
    }
    match tokio::time::timeout(Duration::from_secs(8), cmd.output()).await {
        Ok(Ok(output)) => aliases_from_help(&String::from_utf8_lossy(&output.stdout)),
        _ => Vec::new(),
    }
}

fn settings_models() -> Vec<String> {
    let Some(path) = dirs::home_dir().map(|home| home.join(".claude").join("settings.json")) else {
        return Vec::new();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .map(|value| models_from_settings(&value))
        .unwrap_or_default()
}

async fn api_models() -> Vec<ClaudeModelOption> {
    let Some(api_key) = crate::claude::official_anthropic_api_key() else {
        return Vec::new();
    };
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    else {
        return Vec::new();
    };
    let response = client
        .get("https://api.anthropic.com/v1/models?limit=100")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await;
    let Ok(response) = response else {
        return Vec::new();
    };
    if !response.status().is_success() {
        return Vec::new();
    }
    response
        .text()
        .await
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .map(|body| models_from_api(&body))
        .unwrap_or_default()
}

#[tauri::command]
pub async fn list_claude_models() -> Result<Vec<ClaudeModelOption>, String> {
    let mut models = builtin_aliases();
    for alias in help_aliases().await {
        let label = alias_label(&alias);
        push_unique(
            &mut models,
            option(&alias, &label, "Alias from the installed Claude Code"),
        );
    }
    let mut pinned = settings_models();
    if let Ok(model) = std::env::var("ANTHROPIC_MODEL") {
        pinned.push(model);
    }
    for id in pinned {
        push_unique(
            &mut models,
            option(&id, &id, "From your Claude Code settings"),
        );
    }
    for item in api_models().await {
        push_unique(&mut models, item);
    }
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builtin_aliases_include_every_family() {
        let ids: Vec<String> = builtin_aliases().into_iter().map(|m| m.id).collect();
        for id in [
            "default", "fable", "opus", "sonnet", "haiku", "opusplan", "opus[1m]",
        ] {
            assert!(ids.contains(&id.to_string()), "missing {id}");
        }
    }

    #[test]
    fn parses_aliases_from_wrapped_help_text() {
        let help = "Options:\n  --model <model>   Model for the current session. Provide\n                    an alias for the latest model (e.g.\n                    'fable', 'opus', or 'sonnet') or a\n                    model's full name.\n  --verbose  Verbose 'not-this'\n";
        assert_eq!(aliases_from_help(help), vec!["fable", "opus", "sonnet"]);
    }

    #[test]
    fn help_without_model_flag_yields_nothing() {
        assert!(aliases_from_help("Usage: claude [options]\n  -p  print").is_empty());
    }

    #[test]
    fn reads_pinned_models_from_settings() {
        let settings = json!({"model": "claude-opus-5-5", "availableModels": ["fable", " "]});
        assert_eq!(
            models_from_settings(&settings),
            vec!["claude-opus-5-5", "fable"]
        );
    }

    #[test]
    fn reads_models_api_response() {
        let body = json!({"data": [{"id": "claude-fable-5-1", "display_name": "Claude Fable 5.1"}, {"id": "claude-haiku-4-5"}]});
        let models = models_from_api(&body);
        assert_eq!(
            models[0],
            option("claude-fable-5-1", "Claude Fable 5.1", "claude-fable-5-1")
        );
        assert_eq!(models[1].label, "claude-haiku-4-5");
    }

    #[test]
    fn alias_labels_are_readable() {
        assert_eq!(alias_label("fable"), "Fable");
        assert_eq!(alias_label("sonnet[1m]"), "Sonnet 1M");
    }
}
