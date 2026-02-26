import { HeadingPitchRange } from "cesium";
import type { Cesium3DTileset, Viewer } from "cesium";
import { unionAllTilesetsBoundingSphereCompute } from "./useCesiumUtility";

type FitCameraOptions = {
  duration?: number;
  heading?: number;
  pitch?: number;
  rangeMultiplier?: number;
  minRange?: number;
};

export function fitCameraToTilesets(
  viewer: Viewer,
  tilesets: Cesium3DTileset[],
  options: FitCameraOptions = {}
) {
  if (!viewer || viewer.isDestroyed?.()) return;
  const sphere = unionAllTilesetsBoundingSphereCompute(tilesets);
  if (!sphere || sphere.radius <= 0) return;

  const {
    duration = 1.2,
    heading = 0,
    pitch = -0.5,
    rangeMultiplier = 2.2,
    minRange = 50,
  } = options;

  const range = Math.max(sphere.radius * rangeMultiplier, minRange);
  const offset = new HeadingPitchRange(heading, pitch, range);

  viewer.camera.flyToBoundingSphere(sphere, {
    duration,
    offset,
  });
}
