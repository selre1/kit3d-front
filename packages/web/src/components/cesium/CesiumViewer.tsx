import { useMemo, useState } from "react";
import type { Viewer } from "cesium";
import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumTilesets } from "./useCesiumTilesets";
import { useCesiumFeaturePicker } from "./useCesiumFeaturePicker";
import { useCesiumCompass } from "./useCesiumCompass";
import {
  defaultCesiumSpecialEvn,
  useCesiumSpecialEvn,
} from "./useCesiumSpecialEvn";
import { useCesiumMeasure } from "./useCesiumMeasure";
import { CesiumToolbar } from "./CesiumToolbar";
import { CesiumTerrainControls } from "./CesiumTerrainControls";
import { CesiumMeasureControls } from "./CesiumMeasureControls";
import type { CesiumViewerProps } from "./types";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./cesium.css";

export function CesiumViewer({
  className,
  tilesetUrls,
  onFeatureSelect,
}: CesiumViewerProps) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [cesiumSpecialEvn, setCesiumSpecialEvn] = useState(
    defaultCesiumSpecialEvn
  );
  useCesiumViewer({ containerId: "viewer", onReady: setViewer });

  const normalizedUrls = useMemo(
    () => (tilesetUrls ? tilesetUrls.filter(Boolean) : []),
    [tilesetUrls]
  );
  useCesiumTilesets({ viewer, urls: normalizedUrls });
  const measure = useCesiumMeasure({ viewer });
  useCesiumFeaturePicker({
    viewer,
    onSelect: onFeatureSelect,
    enabled: measure.mode === "none",
  });
  useCesiumCompass({ viewer });
  useCesiumSpecialEvn({ viewer, env: cesiumSpecialEvn });
  
  const classes = ["cesium-viewer-root", className].filter(Boolean).join(" ");
  return (
    <div className="cesium-viewer-shell">
      <div className="cesium-viewer-canvas">
        <div id="viewer" className={classes} />
      </div>
      <CesiumToolbar>
        <CesiumTerrainControls
          value={cesiumSpecialEvn}
          onChange={setCesiumSpecialEvn}
        />
        <CesiumMeasureControls
          mode={measure.mode}
          onModeChange={measure.setMode}
          onClear={measure.clear}
        />
      </CesiumToolbar>
    </div>
  );
}
