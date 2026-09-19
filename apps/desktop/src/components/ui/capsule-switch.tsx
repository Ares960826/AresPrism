import { cn } from "@/lib/utils";

export function CapsuleSwitchThumb({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
        checked ? "bg-sky-600" : "bg-neutral-200 dark:bg-neutral-600",
      )}
    >
      <span
        className={cn(
          "size-4 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </span>
  );
}

export function CapsuleSwitch({
  checked,
  label,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "flex h-8 w-full items-center justify-between rounded-md border border-border px-2.5 text-xs",
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <span>{label}</span>
      <CapsuleSwitchThumb checked={checked} />
    </button>
  );
}

export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
        selected
          ? "border-sky-600"
          : "border-muted-foreground/35 bg-background",
      )}
    >
      {selected ? <span className="size-2 rounded-full bg-sky-600" /> : null}
    </span>
  );
}
