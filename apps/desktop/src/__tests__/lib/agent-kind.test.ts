import { describe, expect, it } from "vitest";
import {
  AGENT_OPTIONS,
  agentLabel,
  agentSessionKey,
  describeAgentModel,
  effortAbbrev,
  isAgentKind,
  isLocalCliAgentKey,
  mergeAgentModels,
} from "@/lib/agent-kind";

describe("agent kind", () => {
  it("accepts the four local CLIs", () => {
    expect(isAgentKind("claude")).toBe(true);
    expect(isAgentKind("codex")).toBe(true);
    expect(isAgentKind("grok")).toBe(true);
    expect(isAgentKind("kimi")).toBe(true);
    expect(isAgentKind("opencode")).toBe(false);
  });

  it("keeps Claude on the existing provider session key", () => {
    expect(agentSessionKey("claude", "__claude-code__")).toBe(
      "__claude-code__",
    );
    expect(agentSessionKey("codex", "__claude-code__")).toBe("agent:codex");
  });

  it("labels the shipped CLIs", () => {
    expect(agentLabel("grok")).toBe("Grok Build");
    expect(AGENT_OPTIONS.map((option) => option.binary)).toEqual([
      "claude",
      "codex",
      "grok",
      "kimi",
    ]);
    expect(isLocalCliAgentKey("agent:kimi")).toBe(true);
    expect(isLocalCliAgentKey("__claude-code__")).toBe(false);
  });
});

describe("agent models", () => {
  it("uses only live CLI models when the local CLI reports any", () => {
    const merged = mergeAgentModels("grok", ["grok-4.6", "grok-custom"]);
    expect(merged.map((item) => item.id)).toEqual(["grok-4.6", "grok-custom"]);
  });

  it("abbreviates effort like Claude Code", () => {
    expect(effortAbbrev("medium")).toBe("M");
    expect(effortAbbrev("xhigh")).toBe("xH");
    expect(effortAbbrev("thinking")).toBe("T");
  });

  it("gives Claude-style names and icons to CLI models", () => {
    expect(describeAgentModel("gpt-6-astra").icon).toBe("sparkles");
    expect(describeAgentModel("gpt-5.4-mini").icon).toBe("rabbit");
  });
});
