import { useEffect, useRef } from "react";
import {
  Cesium3DTileFeature,
  Color,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type { Cartesian2, Viewer } from "cesium";
import type { CesiumFeatureInfo } from "./types";

type UseCesiumFeaturePickerOptions = {
  viewer: Viewer | null;
  onSelect?: (info: CesiumFeatureInfo | null) => void;
  enabled?: boolean;
};

type HighlightedFeature = {
  feature: Cesium3DTileFeature;
  color: Color;
};

function canAccessFeature(feature: Cesium3DTileFeature): boolean {
  const anyFeature = feature as unknown as {
    content?: { tileset?: { isDestroyed?: () => boolean } };
    tileset?: { isDestroyed?: () => boolean };
    isDestroyed?: () => boolean;
  };
  if (anyFeature?.isDestroyed?.()) return false;
  if (anyFeature?.content?.tileset?.isDestroyed?.()) return false;
  if (anyFeature?.tileset?.isDestroyed?.()) return false;
  return true;
}

function parseProps(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch (err) {
      return null;
    }
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function getFeatureInfo(feature: Cesium3DTileFeature): CesiumFeatureInfo {
  const propertyIds = feature.getPropertyIds?.() ?? [];
  const raw: Record<string, unknown> = {};
  propertyIds.forEach((id) => {
    raw[id] = feature.getProperty(id);
  });
  const props = parseProps(raw.props);
  const meta: Record<string, unknown> = { ...raw };
  delete meta.props;
  return { meta, props, raw };
}

export function useCesiumFeaturePicker({
  viewer,
  onSelect,
  enabled = true,
}: UseCesiumFeaturePickerOptions) {
  const highlightedRef = useRef<HighlightedFeature | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (!enabled) {
      onSelect?.(null);
      return;
    }

    const handler = viewer.screenSpaceEventHandler;
    const clearHighlight = () => {
      if (!highlightedRef.current) return;
      try {
        const { feature, color } = highlightedRef.current;
        if (canAccessFeature(feature)) {
          feature.color = color;
        }
      } catch (err) {
        // ignore stale feature cleanup
      } finally {
        highlightedRef.current = null;
      }
    };

    const onClick = (movement: { position: Cartesian2 }) => {
      if (viewer.isDestroyed() || !viewer.scene) return;
      const picked = viewer.scene.pick(movement.position);
      clearHighlight();

      if (!defined(picked) || !(picked instanceof Cesium3DTileFeature)) {
        onSelect?.(null);
        return;
      }

      try {
        if (!canAccessFeature(picked)) {
          onSelect?.(null);
          return;
        }
        highlightedRef.current = {
          feature: picked,
          color: picked.color.clone(),
        };
        picked.color = Color.YELLOW.withAlpha(0.85);
        onSelect?.(getFeatureInfo(picked));
      } catch (err) {
        onSelect?.(null);
        clearHighlight();
      }
    };

    handler.setInputAction(onClick, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!viewer.isDestroyed()) {
        handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      }
      clearHighlight();
      onSelect?.(null);
    };
  }, [viewer, onSelect, enabled]);
}
