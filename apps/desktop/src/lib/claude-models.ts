import { invoke } from "@tauri-apps/api/core";

export interface ClaudeModelOption {
  id: string;
  label: string;
  description: string;
}

/** Same aliases as `claude_models.rs`; shown until the live list arrives. */
export const CLAUDE_MODEL_ALIASES: ClaudeModelOption[] = [
  {
    id: "default",
    label: "Default",
    description: "Your account's recommended model",
  },
  {
    id: "fable",
    label: "Fable",
    description: "Newest Fable model, most capable",
  },
  {
    id: "opus",
    label: "Opus",
    description: "Newest Opus model, complex reasoning",
  },
  {
    id: "sonnet",
    label: "Sonnet",
    description: "Newest Sonnet model, fast and capable",
  },
  { id: "haiku", label: "Haiku", description: "Newest Haiku model, fastest" },
  {
    id: "opusplan",
    label: "OpusPlan",
    description: "Opus while planning, Sonnet while executing",
  },
  {
    id: "fable[1m]",
    label: "Fable 1M",
    description: "Fable with 1M-token context",
  },
  {
    id: "opus[1m]",
    label: "Opus 1M",
    description: "Opus with 1M-token context",
  },
  {
    id: "sonnet[1m]",
    label: "Sonnet 1M",
    description: "Sonnet with 1M-token context",
  },
];

export const CLAUDE_MODEL_STORAGE_KEY = "ares-prism-claude-model";
export const DEFAULT_CLAUDE_MODEL = "opus";

export function loadClaudeModel(): string {
  try {
    const value = globalThis.localStorage?.getItem(CLAUDE_MODEL_STORAGE_KEY);
    return value?.trim() || DEFAULT_CLAUDE_MODEL;
  } catch {
    return DEFAULT_CLAUDE_MODEL;
  }
}

export function persistClaudeModel(model: string) {
  try {
    globalThis.localStorage?.setItem(CLAUDE_MODEL_STORAGE_KEY, model);
  } catch {
    // Private mode / blocked storage: the choice lasts for this session only.
  }
}

/** `--model` value for the CLI; "default" leaves the choice to Claude Code. */
export function claudeModelArg(model: string): string | null {
  const trimmed = model.trim();
  return trimmed && trimmed !== "default" ? trimmed : null;
}

export function claudeModelDisplayName(model: string): string {
  return (
    CLAUDE_MODEL_ALIASES.find((option) => option.id === model)?.label ?? model
  );
}

let cached: Promise<ClaudeModelOption[]> | null = null;

/** Live list from the installed CLI, settings and (with an API key) the API. */
export function listClaudeModels(
  refresh = false,
): Promise<ClaudeModelOption[]> {
  if (!cached || refresh) {
    cached = invoke<ClaudeModelOption[]>("list_claude_models")
      .then((models) => (models.length > 0 ? models : CLAUDE_MODEL_ALIASES))
      .catch(() => {
        cached = null;
        return CLAUDE_MODEL_ALIASES;
      });
  }
  return cached;
}
