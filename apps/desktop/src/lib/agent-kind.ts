export type AgentKind = "claude" | "codex" | "grok" | "kimi";

export const AGENT_OPTIONS: {
  id: AgentKind;
  label: string;
  binary: string;
  hint: string;
}[] = [
  {
    id: "claude",
    label: "Claude Code",
    binary: "claude",
    hint: "Existing Claude Code CLI, including OpenAI-compatible providers.",
  },
  {
    id: "codex",
    label: "Codex",
    binary: "codex",
    hint: "OpenAI Codex CLI (`codex exec --json`). Sign in with the CLI.",
  },
  {
    id: "grok",
    label: "Grok Build",
    binary: "grok",
    hint: "Grok Build TUI (`grok -p --output-format streaming-messages-json`).",
  },
  {
    id: "kimi",
    label: "Kimi Code",
    binary: "kimi",
    hint: "Kimi Code CLI (`kimi --print --output-format stream-json`).",
  },
];

export function isAgentKind(value: unknown): value is AgentKind {
  return (
    value === "claude" ||
    value === "codex" ||
    value === "grok" ||
    value === "kimi"
  );
}

export function agentLabel(kind: AgentKind): string {
  return AGENT_OPTIONS.find((option) => option.id === kind)?.label ?? kind;
}

export function agentSessionKey(
  kind: AgentKind,
  claudeProviderKey: string,
): string {
  return kind === "claude" ? claudeProviderKey : `agent:${kind}`;
}

export function isLocalCliAgentKey(providerKey: string | null): boolean {
  return !!providerKey?.startsWith("agent:");
}

export interface AgentModelOption {
  id: string;
  label: string;
  desc: string;
}

export const AGENT_MODELS: Record<AgentKind, AgentModelOption[]> = {
  claude: [
    { id: "sonnet", label: "Sonnet", desc: "Fast, efficient for most tasks" },
    { id: "opus", label: "Opus", desc: "Most capable, complex reasoning" },
    { id: "haiku", label: "Haiku", desc: "Fastest, simple tasks" },
    {
      id: "opusplan",
      label: "OpusPlan",
      desc: "Opus for planning, Sonnet for execution",
    },
  ],
  codex: [],
  grok: [],
  kimi: [],
};

export const AGENT_EFFORTS: Record<AgentKind, { id: string; label: string }[]> =
  {
    claude: [
      { id: "low", label: "L" },
      { id: "medium", label: "M" },
      { id: "high", label: "H" },
    ],
    codex: [
      { id: "low", label: "L" },
      { id: "medium", label: "M" },
      { id: "high", label: "H" },
      { id: "xhigh", label: "xH" },
      { id: "ultra", label: "U" },
      { id: "max", label: "Max" },
    ],
    grok: [
      { id: "low", label: "L" },
      { id: "medium", label: "M" },
      { id: "high", label: "H" },
      { id: "xhigh", label: "xH" },
    ],
    kimi: [
      { id: "no-thinking", label: "Off" },
      { id: "thinking", label: "T" },
    ],
  };

export type AgentModelIcon = "zap" | "sparkles" | "rabbit" | "layers";

export function describeAgentModel(id: string): {
  name: string;
  desc: string;
  icon: AgentModelIcon;
} {
  const raw = id.trim();
  const lower = raw.toLowerCase();
  const name = raw
    .replace(/^gpt-/i, "GPT-")
    .replace(/^grok-/i, "Grok ")
    .replace(/^kimi-/i, "Kimi ")
    .replace(/-/g, " ");
  if (
    lower.includes("opus") ||
    lower.includes("pro") ||
    lower.includes("astra") ||
    lower.includes("max")
  ) {
    return { name, desc: "Most capable", icon: "sparkles" };
  }
  if (
    lower.includes("haiku") ||
    lower.includes("mini") ||
    lower.includes("fast")
  ) {
    return { name, desc: "Fastest, lighter tasks", icon: "rabbit" };
  }
  if (
    lower.includes("plan") ||
    lower.includes("luna") ||
    lower.includes("sol") ||
    lower.includes("terra")
  ) {
    return { name, desc: "Planning / specialist", icon: "layers" };
  }
  return { name, desc: "Default coding model", icon: "zap" };
}

export function effortAbbrev(id: string): string {
  switch (id) {
    case "low":
      return "L";
    case "medium":
      return "M";
    case "high":
      return "H";
    case "xhigh":
      return "xH";
    case "ultra":
      return "U";
    case "max":
      return "Max";
    case "thinking":
      return "T";
    case "no-thinking":
      return "Off";
    default:
      return id;
  }
}

export function defaultAgentEffort(kind: AgentKind): string {
  if (kind === "kimi") return "no-thinking";
  return "medium";
}

export function defaultAgentModel(kind: AgentKind): string {
  return AGENT_MODELS[kind][0]?.id ?? "";
}

export function mergeAgentModels(
  kind: AgentKind,
  live: string[],
): AgentModelOption[] {
  const unique = [...new Set(live.map((id) => id.trim()).filter(Boolean))];
  if (unique.length > 0) {
    return unique.map((id) => {
      const visual = describeAgentModel(id);
      return {
        id,
        label: visual.name,
        desc: visual.desc,
      };
    });
  }
  return AGENT_MODELS[kind];
}
