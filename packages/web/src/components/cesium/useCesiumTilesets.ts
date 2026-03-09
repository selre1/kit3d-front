import { useEffect, useMemo, useRef } from "react";
import { Cesium3DTileset, Cesium3DTileStyle } from "cesium";
import type { Viewer } from "cesium";
import { applyTilesetBounds } from "./useCesiumUtility";
import { fitCameraToTilesets } from "./useCameraMovement";


type UseCesiumTilesetsOptions = {
  viewer: Viewer | null;
  urls: string[];
};

function normalizeUrls(urls: string[]) {
  const filtered = urls.filter((url) => Boolean(url && url.trim()));
  const unique = Array.from(new Set(filtered));
  return unique;
}

function sameUrls(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function useCesiumTilesets({ viewer, urls }: UseCesiumTilesetsOptions) {
  const loadedRef = useRef<Cesium3DTileset[]>([]);
  const lastUrlsRef = useRef<string[]>([]);
  const lastViewerRef = useRef<Viewer | null>(null);
  const normalizedUrls = useMemo(() => normalizeUrls(urls), [urls]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (viewer !== lastViewerRef.current) {
      lastViewerRef.current = viewer;
      lastUrlsRef.current = [];
    }
    if (sameUrls(lastUrlsRef.current, normalizedUrls)) return;

    let cancelled = false;

    const unloadTilesets = () => {
      const tilesets = loadedRef.current;
      loadedRef.current = [];
      if (!tilesets.length) return;
      if (!viewer || viewer.isDestroyed()) {
        tilesets.forEach((tileset) => {
          if (!tileset || tileset.isDestroyed()) return;
          tileset.destroy();
        });
        return;
      }
      tilesets.forEach((tileset) => {
        if (!tileset) return;
        viewer.scene.primitives.remove(tileset);
        if (!tileset.isDestroyed()) {
          tileset.destroy();
        }
      });
      applyTilesetBounds(viewer, []);
    };

    const createTileset = async (url: string) => {
      try {
        const tileset = await Cesium3DTileset.fromUrl(url, {
          //shadows: ShadowMode.ENABLED,
          maximumScreenSpaceError: 16,
        });

        if (cancelled || viewer.isDestroyed()) {
          if (!tileset.isDestroyed()) {
            tileset.destroy();
          }
          return undefined;
        }

        tileset.style = new Cesium3DTileStyle({
          color: {
              conditions: [
                  ["${ifc_class} === 'IfcWall'", "color('#bababa')"],
                  ["${ifc_class} === 'IfcSlab'", "color('#bababa')"],
                  ["${ifc_class} === 'IfcWallStandardCase'", "color('#bababa')"],
                  ["${ifc_class} === 'IfcOpeningElement'", "color('#bababa')"],
              ]
          },
          show: "${ifc_class} !== 'IfcOpeningElement'",
        });

        viewer.scene.primitives.add(tileset);
        return tileset;
      } catch (error) {
        console.warn("Tileset load failed:", error);
        return undefined;
      }
    };

    const loadAll = async () => {
      unloadTilesets();
      lastUrlsRef.current = normalizedUrls;

      if (!normalizedUrls.length) {
        applyTilesetBounds(viewer, []);
        return;
      }

      const results = await Promise.allSettled(
        normalizedUrls.map((url) => createTileset(url))
      );

      if (cancelled || viewer.isDestroyed()) {
        unloadTilesets();
        return;
      }

      const loaded: Cesium3DTileset[] = [];
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          loaded.push(result.value);
        }
      });

      loadedRef.current = loaded;
      applyTilesetBounds(viewer, loaded);
      if (loaded.length > 0) {
        fitCameraToTilesets(viewer, loaded);
      }
    };

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [viewer, normalizedUrls]);
}
