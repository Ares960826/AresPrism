import { useEffect } from "react";

/** Preview windows have no CodeMirror keymap, so handle their compile shortcut. */
export function usePreviewCompileShortcut(compile: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        !(
          event.key === "Enter" ||
          (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "s")
        )
      )
        return;
      event.preventDefault();
      compile();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compile]);
}
