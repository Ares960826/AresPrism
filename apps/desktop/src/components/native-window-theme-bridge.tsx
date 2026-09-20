import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "next-themes";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("app");

export function NativeWindowThemeBridge() {
  const { resolvedTheme, theme } = useTheme();

  useEffect(() => {
    const syncNativeTheme = () => {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        resolvedTheme === "dark";
      const nativeTheme = isDark ? "dark" : "light";

      document.documentElement.style.colorScheme = nativeTheme;
      invoke("set_native_window_theme", { theme: nativeTheme })
        .catch((err) => {
          log.warn("Failed to sync native window theme via Rust command", {
            error: String(err),
          });
          return getCurrentWindow().setTheme(nativeTheme);
        })
        .catch((err) => {
          log.warn("Failed to sync native window theme via JS API", {
            error: String(err),
          });
        });
    };

    syncNativeTheme();

    const observer = new MutationObserver(syncNativeTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemThemeQuery.addEventListener("change", syncNativeTheme);

    return () => {
      observer.disconnect();
      systemThemeQuery.removeEventListener("change", syncNativeTheme);
    };
  }, [resolvedTheme, theme]);

  return null;
}
