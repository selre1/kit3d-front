import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { DemViewerSource } from "./types";

type DemViewportProps = {
  seedKey?: string | null;
  source?: DemViewerSource | null;
  autoRotate?: boolean;
  onMetaChange?: (meta: string | null) => void;
};

type DemWorkerSuccess = {
  ok: true;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  zValues: ArrayBuffer;
  colors: ArrayBuffer;
};

type DemWorkerFailure = {
  ok: false;
  error: string;
};

type DemWorkerResponse = DemWorkerSuccess | DemWorkerFailure;

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

function createDemMesh(
  width: number,
  height: number,
  zValues: Float32Array,
  colors: Float32Array
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    width,
    height,
    Math.max(1, width - 1),
    Math.max(1, height - 1)
  );
  const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;
  const positionArray = positionAttribute.array as Float32Array;

  for (let index = 0, zIndex = 2; index < zValues.length; index += 1, zIndex += 3) {
    positionArray[zIndex] = zValues[index];
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

async function runDemWorker(
  arrayBuffer: ArrayBuffer,
  signal: AbortSignal
): Promise<DemWorkerResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const worker = new Worker(new URL("./dem.worker.ts", import.meta.url), {
      type: "module",
    });

    const cleanup = () => {
      signal.removeEventListener("abort", handleAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    worker.onmessage = (event: MessageEvent<DemWorkerResponse>) => {
      cleanup();
      resolve(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "DEM worker failed"));
    };

    worker.postMessage({ arrayBuffer }, [arrayBuffer]);
  });
}

async function loadDemFromSource(source: DemViewerSource, signal: AbortSignal) {
  const arrayBuffer = await readSourceArrayBuffer(source, signal);
  const workerResult = await runDemWorker(arrayBuffer, signal);
  if (!workerResult.ok) {
    throw new Error(workerResult.error);
  }

  const zValues = new Float32Array(workerResult.zValues);
  const colors = new Float32Array(workerResult.colors);
  const terrain = createDemMesh(workerResult.width, workerResult.height, zValues, colors);

  return {
    terrain,
    sourceMeta: `${workerResult.sourceWidth}x${workerResult.sourceHeight}`,
  };
}

export function DemViewport({
  seedKey,
  source,
  autoRotate = true,
  onMetaChange,
}: DemViewportProps) {
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

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(500, 1000, 250);
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
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

    loadDemFromSource(source, controller.signal)
      .then(({ terrain, sourceMeta }) => {
        if (cancelled) {
          disposeMesh(terrain);
          return;
        }
        terrainRef.current = terrain;
        scene.add(terrain);
        onMetaChange?.(sourceMeta);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        onMetaChange?.(null);
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
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
    <div className="dem-viewport">
      <div ref={containerRef} className="dem-canvas" />
      {loading ? <div className="dem-status">지형 렌더링 중...</div> : null}
      {viewerError ? <div className="dem-error">{viewerError}</div> : null}
    </div>
  );
}
