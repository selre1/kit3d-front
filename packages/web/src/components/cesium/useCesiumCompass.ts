import { useEffect } from "react";
import type { Viewer } from "cesium";

type UseCesiumCompassOptions = {
  viewer: Viewer | null;
  src?: string;
};

export function useCesiumCompass({
  viewer,
  src = "/compass.svg",
}: UseCesiumCompassOptions) {
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const container = viewer.container;
    if (!container) return;

    const compass = document.createElement("div");
    compass.className = "hud-compass";

    const img = document.createElement("img");
    img.src = src;
    img.alt = "Compass";
    img.className = "hud-compass-icon";
    compass.appendChild(img);

    container.appendChild(compass);

    const onPostRender = () => {
      if (viewer.isDestroyed()) return;
      const heading = viewer.camera.heading;
      img.style.transform = `rotate(${-heading}rad)`;
    };

    viewer.scene.postRender.addEventListener(onPostRender);

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene?.postRender?.removeEventListener?.(onPostRender);
      }
      compass.remove();
    };
  }, [viewer, src]);
}
