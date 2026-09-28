use serde_json::{json, Value};
pub fn is_go(base: &str) -> bool {
    reqwest::Url::parse(base).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("opencode.ai")
            && url.path().starts_with("/zen/go/v1")
    })
}
pub fn responses(base: &str, model: &str) -> bool {
    is_go(base)
        && (model.starts_with("gpt-")
            || model.starts_with("grok-")
            || model.starts_with("muse-spark"))
}
pub fn endpoint(base: &str, model: &str) -> String {
    if responses(base, model) {
        "https://opencode.ai/zen/go/v1/responses".into()
    } else {
        let clean = base.trim_end_matches('/');
        if clean.ends_with("/chat/completions") {
            clean.into()
        } else if clean.ends_with("/v1") {
            format!("{clean}/chat/completions")
        } else {
            format!("{clean}/v1/chat/completions")
        }
    }
}
pub fn headers(
    request: reqwest::RequestBuilder,
    base: &str,
    session: &str,
) -> reqwest::RequestBuilder {
    if is_go(base) {
        request
            .header(
                "User-Agent",
                concat!("AresPrism/", env!("CARGO_PKG_VERSION")),
            )
            .header("x-opencode-session", session)
    } else {
        request
    }
}
pub fn body(base: &str, model: &str, chat: Value) -> Value {
    if !responses(base, model) {
        return chat;
    }
    let mut input = Vec::new();
    for message in chat["messages"].as_array().into_iter().flatten() {
        let role = message["role"].as_str().unwrap_or("user");
        if role == "tool" {
            input.push(json!({"type":"function_call_output", "call_id":message["tool_call_id"], "output":message["content"]}));
            continue;
        }
        let content = &message["content"];
        if !content.is_null() {
            let converted = if let Some(parts) = content.as_array() {
                Value::Array(parts.iter().map(|part| {
                if part["type"] == "image_url" {json!({"type":"input_image","image_url":part["image_url"]["url"]})}
                else {json!({"type":if role == "assistant" {"output_text"} else {"input_text"},"text":part["text"]})}
            }).collect())
            } else {
                content.clone()
            };
            input.push(json!({"role":role,"content":converted}));
        }
        for tool in message["tool_calls"].as_array().into_iter().flatten() {
            input.push(json!({"type":"function_call","call_id":tool["id"],"name":tool["function"]["name"],"arguments":tool["function"]["arguments"]}));
        }
    }
    let mut result = json!({"model":model,"input":input,"stream":false,"store":false});
    if let Some(max) = chat
        .get("max_tokens")
        .or_else(|| chat.get("max_completion_tokens"))
    {
        result["max_output_tokens"] = max.clone();
    }
    if let Some(tools) = chat["tools"].as_array() {
        result["tools"] = Value::Array(
            tools
                .iter()
                .map(|t| {
                    let mut f = t["function"].clone();
                    f["type"] = json!("function");
                    f
                })
                .collect(),
        );
    }
    if let Some(choice) = chat.get("tool_choice") {
        result["tool_choice"] = if choice.is_object() {
            json!({"type":"function","name":choice["function"]["name"]})
        } else {
            choice.clone()
        };
    }
    result
}
pub fn chat_response(base: &str, model: &str, response: Value) -> Value {
    if !responses(base, model) {
        return response;
    }
    let mut text = String::new();
    let mut tools = Vec::new();
    for output in response["output"].as_array().into_iter().flatten() {
        if output["type"] == "function_call" {
            tools.push(json!({"id":output["call_id"],"type":"function","function":{"name":output["name"],"arguments":output["arguments"]}}));
        }
        for part in output["content"].as_array().into_iter().flatten() {
            if let Some(t) = part["text"].as_str() {
                text.push_str(t);
            }
        }
    }
    let finish = if tools.is_empty() {
        "stop"
    } else {
        "tool_calls"
    };
    json!({"id":response["id"],"choices":[{"message":{"role":"assistant","content":text,"tool_calls":tools},"finish_reason":finish}],"usage":{"prompt_tokens":response["usage"]["input_tokens"],"completion_tokens":response["usage"]["output_tokens"]}})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn go_protocols_and_tool_roundtrip() {
        assert_eq!(
            endpoint("https://opencode.ai/zen/go/v1", "gpt-6-luna"),
            "https://opencode.ai/zen/go/v1/responses"
        );
        assert_eq!(
            endpoint("https://opencode.ai/zen/go/v1", "glm-5.3"),
            "https://opencode.ai/zen/go/v1/chat/completions"
        );
        assert!(!is_go("https://opencode.ai.example/zen/go/v1"));
        let request = body(
            "https://opencode.ai/zen/go/v1",
            "gpt-6-luna",
            json!({"messages":[{"role":"assistant","tool_calls":[{"id":"call_1","function":{"name":"read","arguments":"{}"}}]},{"role":"tool","tool_call_id":"call_1","content":"done"}]}),
        );
        assert_eq!(request["input"][1]["call_id"], "call_1");
        let result = chat_response(
            "https://opencode.ai/zen/go/v1",
            "gpt-6-luna",
            json!({"output":[{"type":"function_call","call_id":"call_2","name":"read","arguments":"{}"}]}),
        );
        assert_eq!(
            result["choices"][0]["message"]["tool_calls"][0]["id"],
            "call_2"
        );
    }
}
