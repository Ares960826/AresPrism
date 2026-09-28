import { useEffect, useState } from "react";
import { persistAppZoom, readStoredAppZoom } from "@/lib/app-zoom";
export function AppZoomControls() {
  const [zoom, setZoom] = useState(readStoredAppZoom);
  useEffect(() => {
    const update = () => setZoom(readStoredAppZoom());
    window.addEventListener("app-zoom-changed", update);
    return () => window.removeEventListener("app-zoom-changed", update);
  }, []);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Zoom app out"
        onClick={() => void persistAppZoom(zoom - 0.1)}
      >
        −
      </button>
      <select
        aria-label="App zoom"
        value={Math.round(zoom * 100)}
        onChange={(e) => void persistAppZoom(Number(e.target.value) / 100)}
      >
        {Array.from(
          new Set([
            50,
            75,
            90,
            100,
            110,
            125,
            150,
            175,
            200,
            250,
            300,
            Math.round(zoom * 100),
          ]),
        )
          .sort((a, b) => a - b)
          .map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
      </select>
      <button
        type="button"
        aria-label="Zoom app in"
        onClick={() => void persistAppZoom(zoom + 0.1)}
      >
        +
      </button>
      <button type="button" onClick={() => void persistAppZoom(1)}>
        Reset
      </button>
      <span className="text-muted-foreground text-xs">
        Cmd/Ctrl +/− · 0 resets
      </span>
    </div>
  );
}
