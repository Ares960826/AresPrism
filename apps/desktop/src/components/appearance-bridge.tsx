import { useEffect } from "react";
import { applyAppearance } from "@/lib/appearance";
import { useSettingsStore } from "@/stores/settings-store";

export function AppearanceBridge() {
  const uiFont = useSettingsStore((s) => s.uiFont);
  const editorFont = useSettingsStore((s) => s.editorFont);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);

  useEffect(() => {
    applyAppearance({ uiFont, editorFont, uiFontSize, editorFontSize });
  }, [uiFont, editorFont, uiFontSize, editorFontSize]);

  return null;
}
