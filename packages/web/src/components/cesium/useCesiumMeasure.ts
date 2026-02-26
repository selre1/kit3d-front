import { useCallback, useEffect, useState } from "react";
import type { Viewer } from "cesium";

export type MeasureMode = "none" | "position" | "distance" | "area" | "vertical";

type UseCesiumMeasureOptions = {
  viewer: Viewer | null;
};

export function useCesiumMeasure({ viewer }: UseCesiumMeasureOptions) {
  const [mode, setModeState] = useState<MeasureMode>("none");

  const clear = useCallback(() => {
    setModeState("none");
  }, []);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    return () => undefined;
  }, [viewer]);

  const setMode = useCallback((next: MeasureMode) => {
    setModeState(next);
  }, []);

  return {
    mode,
    setMode,
    clear,
  };
}
