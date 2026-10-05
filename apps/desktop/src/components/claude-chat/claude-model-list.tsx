import { useEffect, useState } from "react";
import {
  CheckIcon,
  LayersIcon,
  RabbitIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLAUDE_MODEL_ALIASES,
  listClaudeModels,
  type ClaudeModelOption,
} from "@/lib/claude-models";

function ModelGlyph({ id }: { id: string }) {
  const className = "size-3.5 shrink-0";
  if (id.includes("haiku")) return <RabbitIcon className={className} />;
  if (id.includes("plan")) return <LayersIcon className={className} />;
  if (id.includes("sonnet")) return <ZapIcon className={className} />;
  return <SparklesIcon className={className} />;
}

export function ClaudeModelList({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (model: string) => void;
}) {
  const [models, setModels] =
    useState<ClaudeModelOption[]>(CLAUDE_MODEL_ALIASES);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listClaudeModels().then((list) => {
      if (!cancelled) setModels(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = models.some((model) => model.id === selected)
    ? models
    : [
        ...models,
        { id: selected, label: selected, description: "Custom model id" },
      ];

  const submitCustom = () => {
    const value = custom.trim();
    if (!value) return;
    onSelect(value);
    setCustom("");
  };

  return (
    <>
      {shown.map((model) => (
        <button
          key={model.id}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-100",
            selected === model.id
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted",
          )}
          onClick={() => onSelect(model.id)}
        >
          <ModelGlyph id={model.id} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-xs">{model.label}</div>
            <div className="truncate text-muted-foreground text-xs">
              {model.description}
            </div>
          </div>
          {selected === model.id && <CheckIcon className="size-3 shrink-0" />}
        </button>
      ))}
      <form
        className="flex items-center gap-1 px-2 pt-1 pb-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submitCustom();
        }}
      >
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Other model id, e.g. claude-opus-5-5"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Custom Claude model id"
        />
        <button
          type="submit"
          disabled={!custom.trim()}
          className="h-7 rounded-md px-2 text-xs hover:bg-muted disabled:opacity-40"
        >
          Use
        </button>
      </form>
    </>
  );
}
