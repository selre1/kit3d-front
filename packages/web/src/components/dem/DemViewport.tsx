import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { buildLineProfile, type DemGridData, type DemLocalPoint } from "./profile";
import type { DemProfileResult, DemViewerSource } from "./types";

type DemViewportProps = {
  seedKey?: string | null;
  source?: DemViewerSource | null;
  autoRotate?: boolean;
  profileEnabled?: boolean;
  profileResetKey?: number;
  onMetaChange?: (meta: string | null) => void;
  onProfileChange?: (profile: DemProfileResult | null) => void;
};

type DemWorkerSuccess = {
  ok: true;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  minElevation: number;
  maxElevation: number;
  elevations: ArrayBuffer;
  zValues: ArrayBuffer;
  colors: ArrayBuffer;
};

type DemWorkerFailure = {
  ok: false;
  error: string;
};

type DemWorkerResponse = DemWorkerSuccess | DemWorkerFailure;

type DemProfilePick = {
  world: THREE.Vector3;
  local: DemLocalPoint;
};

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

function disposeLine(line: THREE.Line | null) {
  if (!line) return;
  line.geometry.dispose();
  const material = line.material;
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

function formatElevation(value: number) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function updateProfileLine(
  scene: THREE.Scene | null,
  lineRef: MutableRefObject<THREE.Line | null>,
  start: THREE.Vector3,
  end: THREE.Vector3
) {
  if (!scene) return;

  if (!lineRef.current) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([start.x, start.y, start.z, end.x, end.y, end.z], 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: 0x4f9dff,
      transparent: true,
      opacity: 0.96,
      linewidth: 2,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 9;
    scene.add(line);
    lineRef.current = line;
    return;
  }

  const positions = new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]);
  lineRef.current.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  lineRef.current.geometry.computeBoundingSphere();
  lineRef.current.visible = true;
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

  const elevations = new Float32Array(workerResult.elevations);
  const zValues = new Float32Array(workerResult.zValues);
  const colors = new Float32Array(workerResult.colors);
  const terrain = createDemMesh(workerResult.width, workerResult.height, zValues, colors);

  return {
    terrain,
    sourceMeta: `${workerResult.sourceWidth}x${workerResult.sourceHeight}`,
    minElevation: workerResult.minElevation,
    maxElevation: workerResult.maxElevation,
    grid: {
      width: workerResult.width,
      height: workerResult.height,
      planeWidth: workerResult.width,
      planeHeight: workerResult.height,
      elevations,
    } satisfies DemGridData,
  };
}

export function DemViewport({
  seedKey,
  source,
  autoRotate = true,
  profileEnabled = false,
  profileResetKey = 0,
  onMetaChange,
  onProfileChange,
}: DemViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);
  const gridDataRef = useRef<DemGridData | null>(null);
  const profileLineRef = useRef<THREE.Line | null>(null);
  const profileStartRef = useRef<DemProfilePick | null>(null);
  const profileEndRef = useRef<DemProfilePick | null>(null);

  const [loading, setLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [profileHint, setProfileHint] = useState<string | null>(null);
  const [elevationRange, setElevationRange] = useState<{ min: number; max: number } | null>(
    null
  );

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

      if (profileLineRef.current) {
        scene.remove(profileLineRef.current);
        disposeLine(profileLineRef.current);
        profileLineRef.current = null;
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

    profileStartRef.current = null;
    profileEndRef.current = null;
    onProfileChange?.(null);
    setProfileHint(null);

    if (profileLineRef.current) {
      profileLineRef.current.visible = false;
    }

    if (!source) {
      setLoading(false);
      setViewerError(null);
      setElevationRange(null);
      gridDataRef.current = null;
      onMetaChange?.(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setViewerError(null);

    loadDemFromSource(source, controller.signal)
      .then(({ terrain, sourceMeta, minElevation, maxElevation, grid }) => {
        if (cancelled) {
          disposeMesh(terrain);
          return;
        }
        terrainRef.current = terrain;
        scene.add(terrain);
        gridDataRef.current = grid;
        setElevationRange({ min: minElevation, max: maxElevation });
        onMetaChange?.(sourceMeta);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setElevationRange(null);
        gridDataRef.current = null;
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
  }, [source, sourceKey, onMetaChange, onProfileChange]);

  useEffect(() => {
    profileStartRef.current = null;
    profileEndRef.current = null;
    onProfileChange?.(null);
    if (profileLineRef.current) {
      profileLineRef.current.visible = false;
    }
    setProfileHint(profileEnabled ? "지형 위에서 시작점을 선택하세요." : null);
  }, [profileResetKey, profileEnabled, onProfileChange]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (!profileEnabled) {
      profileStartRef.current = null;
      profileEndRef.current = null;
      setProfileHint(null);
      return;
    }

    const pickOnTerrain = (event: PointerEvent): DemProfilePick | null => {
      const camera = cameraRef.current;
      const terrain = terrainRef.current;
      if (!camera || !terrain) return null;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(terrain, false);
      if (!hits.length) return null;

      const world = hits[0].point.clone();
      const local = terrain.worldToLocal(world.clone());
      return {
        world,
        local: { x: local.x, y: local.y },
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const start = profileStartRef.current;
      const end = profileEndRef.current;
      if (!start || end) return;

      const picked = pickOnTerrain(event);
      if (!picked) return;

      updateProfileLine(sceneRef.current, profileLineRef, start.world, picked.world);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const picked = pickOnTerrain(event);
      if (!picked) return;

      const start = profileStartRef.current;
      const end = profileEndRef.current;

      if (!start || end) {
        profileStartRef.current = picked;
        profileEndRef.current = null;
        onProfileChange?.(null);
        setProfileHint("끝점을 선택하면 고도 프로파일이 생성됩니다.");
        updateProfileLine(sceneRef.current, profileLineRef, picked.world, picked.world);
        return;
      }

      profileEndRef.current = picked;
      updateProfileLine(sceneRef.current, profileLineRef, start.world, picked.world);

      const grid = gridDataRef.current;
      if (!grid) return;

      const profile: DemProfileResult = buildLineProfile(start.local, picked.local, grid);
      onProfileChange?.(profile);
      setProfileHint("프로파일 생성 완료. 새 시작점을 선택하면 다시 측정합니다.");
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    setProfileHint((current) => current || "지형 위에서 시작점을 선택하세요.");

    return () => {
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [profileEnabled, onProfileChange]);

  return (
    <div className="dem-viewport">
      <div ref={containerRef} className="dem-canvas" />
      {loading ? <div className="dem-status">지형 렌더링 중...</div> : null}
      {viewerError ? <div className="dem-error">{viewerError}</div> : null}
      {profileEnabled && profileHint ? <div className="dem-profile-hint">{profileHint}</div> : null}
      {elevationRange ? (
        <div className="dem-legend" aria-label="elevation-legend">
          <div className="dem-legend-title">Elevation (m)</div>
          <div className="dem-legend-body">
            <div className="dem-legend-max">{formatElevation(elevationRange.max)}</div>
            <div className="dem-legend-scale" />
            <div className="dem-legend-min">{formatElevation(elevationRange.min)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
