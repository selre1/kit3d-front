import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fromArrayBuffer } from "geotiff";

import type { DemViewerSource } from "./types";

type DemThreeViewportProps = {
  seedKey?: string | null;
  source?: DemViewerSource | null;
  autoRotate?: boolean;
  onMetaChange?: (meta: string | null) => void;
};

function parseNoDataValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function disposeMesh(mesh: THREE.Mesh | null) {
  if (!mesh) return;
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
  } else {
    material.dispose();
  }
}

function createTerrainMesh(
  width: number,
  height: number,
  raster: ArrayLike<number>,
  noDataValue: number | null
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1);
  const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;

  const isNoData = (value: number) =>
    !Number.isFinite(value) || (noDataValue !== null && value === noDataValue);

  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let index = 0; index < positionAttribute.count; index += 1) {
    const value = Number(raster[index]);
    if (isNoData(value)) {
      continue;
    }
    if (value < minElevation) minElevation = value;
    if (value > maxElevation) maxElevation = value;
  }

  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) {
    throw new Error("No valid elevation samples found in GeoTIFF.");
  }

  const elevationRange = Math.max(maxElevation - minElevation, 1);
  const heightScale = 0.05;
  const verticalExaggeration = 30.0;
  const elevationGamma = 1.5;
  const colors = new Float32Array(positionAttribute.count * 3);
  const lowColor = new THREE.Color(0x2b8a3e);
  const midColor = new THREE.Color(0xd9c27a);
  const highColor = new THREE.Color(0xf8f9fa);
  const vertexColor = new THREE.Color();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    const rawValue = Number(raster[index]);
    const safeValue = isNoData(rawValue) ? minElevation : rawValue;
    const elevationRatio = (safeValue - minElevation) / elevationRange;
    const weightedRatio = Math.pow(elevationRatio, elevationGamma);
    const normalizedHeight =
      weightedRatio * elevationRange * heightScale * verticalExaggeration;
    positionAttribute.setZ(index, -normalizedHeight);

    if (weightedRatio < 0.5) {
      vertexColor.copy(lowColor).lerp(midColor, weightedRatio / 0.5);
    } else {
      vertexColor.copy(midColor).lerp(highColor, (weightedRatio - 0.5) / 0.5);
    }

    const colorIndex = index * 3;
    colors[colorIndex] = vertexColor.r;
    colors[colorIndex + 1] = vertexColor.g;
    colors[colorIndex + 2] = vertexColor.b;
  }

  positionAttribute.needsUpdate = true;
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    wireframe: false,
  });

  const terrain = new THREE.Mesh(geometry, material);
  terrain.position.y = 0;
  terrain.rotation.x = Math.PI / 2;
  return terrain;
}

async function readSourceArrayBuffer(source: DemViewerSource, signal: AbortSignal) {
  if (source.mode === "file") {
    return source.file.arrayBuffer();
  }

  const response = await fetch(source.url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load DEM source: ${response.status}`);
  }
  return response.arrayBuffer();
}

async function loadTerrainFromSource(source: DemViewerSource, signal: AbortSignal) {
  const arrayBuffer = await readSourceArrayBuffer(source, signal);
  const rawTiff = await fromArrayBuffer(arrayBuffer);
  const tifImage = await rawTiff.getImage();

  const width = tifImage.getWidth();
  const height = tifImage.getHeight();
  const dataResult = await tifImage.readRasters({ interleave: true, samples: [0] });
  const raster = Array.isArray(dataResult)
    ? (dataResult[0] as ArrayLike<number>)
    : (dataResult as ArrayLike<number>);

  const noDataValue = parseNoDataValue(tifImage.getGDALNoData());
  const terrain = createTerrainMesh(width, height, raster, noDataValue);

  return {
    terrain,
    sourceMeta: `${width}x${height}`,
  };
}

export function DemThreeViewport({
  seedKey,
  source,
  autoRotate = true,
  onMetaChange,
}: DemThreeViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);

  const [loading, setLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const sourceKey = useMemo(() => {
    if (!source) return seedKey || "no-dem-source";
    if (source.mode === "file") {
      return `${source.file.name}-${source.file.size}-${source.file.lastModified}`;
    }
    return source.url;
  }, [seedKey, source]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd3d3d3);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      10000
    );
    camera.position.set(1000, 1000, 1000);
    camera.lookAt(scene.position);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0xd3d3d3);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = true;
    controls.maxDistance = 1500;
    controls.minDistance = 0;
    controls.autoRotate = autoRotate;
    controlsRef.current = controls;

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(500, 1000, 250);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
    fillLight.position.set(-420, 720, -260);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.28);
    scene.add(ambientLight);

    const gridHelper = new THREE.GridHelper(1000, 40);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(500);
    scene.add(axesHelper);

    const resizeObserver = new ResizeObserver(() => {
      if (!cameraRef.current || !rendererRef.current) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / Math.max(1, height);
      cameraRef.current.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    const renderLoop = () => {
      controls.update();
      renderer.render(scene, camera);
      frameRef.current = window.requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameRef.current);

      if (terrainRef.current) {
        scene.remove(terrainRef.current);
        disposeMesh(terrainRef.current);
        terrainRef.current = null;
      }

      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (terrainRef.current) {
      scene.remove(terrainRef.current);
      disposeMesh(terrainRef.current);
      terrainRef.current = null;
    }

    if (!source) {
      setLoading(false);
      setViewerError(null);
      onMetaChange?.(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setViewerError(null);

    loadTerrainFromSource(source, controller.signal)
      .then(({ terrain, sourceMeta }) => {
        if (cancelled) {
          disposeMesh(terrain);
          return;
        }
        terrainRef.current = terrain;
        scene.add(terrain);
        onMetaChange?.(sourceMeta);
      })
      .catch(() => {
        if (cancelled) return;
        onMetaChange?.(null);
        setViewerError("DEM 렌더링에 실패했습니다.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [source, sourceKey, onMetaChange]);

  return (
    <div className="dem-three-viewport">
      <div ref={containerRef} className="dem-three-canvas" />
      {loading ? <div className="dem-three-status">Generating 3D Model ...</div> : null}
      {viewerError ? <div className="dem-three-error">{viewerError}</div> : null}
    </div>
  );
}