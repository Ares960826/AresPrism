import { expect, it } from "vitest";
import { isDirectApiProviderKey } from "./agent-kind";

it("does not turn local CLI diagnostics into direct API failures", () => {
  for (const key of [
    "agent:codex",
    "agent:grok",
    "agent:kimi",
    "__claude-code__",
    null,
  ]) {
    expect(isDirectApiProviderKey(key)).toBe(false);
  }
  expect(isDirectApiProviderKey("openai:credential-123")).toBe(true);
});
