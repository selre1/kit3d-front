import { useEffect } from "react";
import { Math as CesiumMath } from "cesium";
import type { Viewer } from "cesium";

export type CesiumSpecialEvn = {
  translucencyEnabled: boolean;
  fadeByDistance: boolean;
  alpha: number;
};

export const defaultCesiumSpecialEvn: CesiumSpecialEvn = {
  translucencyEnabled: true,
  fadeByDistance: true,
  alpha: 0.5,
};

type UseCesiumSpecialEvnOptions = {
  viewer: Viewer | null;
  env: CesiumSpecialEvn;
};

export function useCesiumSpecialEvn({
  viewer,
  env,
}: UseCesiumSpecialEvnOptions) {
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const globe = viewer.scene?.globe;
    if (!globe) return;
    globe.translucency.enabled = env.translucencyEnabled;

    const rawAlpha = Number(env.alpha);
    const alpha = CesiumMath.clamp(
      Number.isFinite(rawAlpha) ? rawAlpha : 1.0,
      0.0,
      1.0
    );

    const scalar = globe.translucency.frontFaceAlphaByDistance;
    if (scalar) {
      scalar.nearValue = alpha;
      scalar.farValue = env.fadeByDistance ? 1.0 : alpha;
    }
  }, [viewer, env]);
}
