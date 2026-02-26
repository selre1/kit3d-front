import { useEffect, useRef } from "react";
import {
  Viewer,
  ImageryLayer,
  WebMapServiceImageryProvider,
  NearFarScalar,
} from "cesium";

type UseCesiumViewerOptions = {
  containerId: string;
  onReady?: (viewer: Viewer | null) => void;
};

const defaultViewerOptions: ConstructorParameters<typeof Viewer>[1] = {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  fullscreenButton: true,
  infoBox: false,
  selectionIndicator: false,
  baseLayer: new ImageryLayer(
    new WebMapServiceImageryProvider({
      url: "https://maps1.geosolutionsgroup.com/geoserver/wms",
      tileWidth: 512,
      tileHeight: 512,
      layers: "osm:osm",
    })
  ),
};

export function useCesiumViewer({ containerId, onReady }: UseCesiumViewerOptions) {
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }

    const fullscreenTarget = container.closest(".conversion-modal-layout") ?? container;
    const viewer = new Viewer(container, {
      ...defaultViewerOptions,
      fullscreenElement: fullscreenTarget,
    });

    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
    viewer.scene.globe.translucency.frontFaceAlphaByDistance = new NearFarScalar(
      400.0,
      0.0,
      2000.0,
      1.0
    );

    requestAnimationFrame(() => {
      container.querySelector(".cesium-viewer-bottom")?.remove();
    });

    viewerRef.current = viewer;
    onReady?.(viewer);

    return () => {
      onReady?.(null);
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [containerId, onReady]);

  return viewerRef;
}
