import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  buildLineProfile,
  sampleSurfaceZ,
  type DemGridData,
  type DemLocalPoint,
} from "./profile";
import type { DemProfileResult, DemViewerSource } from "./types";

type DemViewportProps = {
  seedKey?: string | null;
  source?: DemViewerSource | null;
  autoRotate?: boolean;
  profileEnabled?: boolean;
  profileResetKey?: number;
  onMetaChange?: (meta: string[] | null) => void;
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
  crs: string;
  resolutionXMeter: number;
  resolutionYMeter: number;
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

type ProfileHintState = {
  x: number;
  y: number;
  text: string;
};

const PROFILE_LIFT = 1.4;
const CLICK_MOVE_THRESHOLD = 6;
const HINT_MIN_MOVE_PX = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function disposeMarker(marker: THREE.Mesh | null) {
  if (!marker) return;
  marker.geometry.dispose();
  const material = marker.material;
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

function ensureProfileLine(
  scene: THREE.Scene | null,
  lineRef: MutableRefObject<THREE.Line | null>,
  color: number
) {
  if (!scene) return null;
  if (!lineRef.current) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 11;
    scene.add(line);
    lineRef.current = line;
  }
  return lineRef.current;
}

function setLinePositions(line: THREE.Line | null, positions: Float32Array) {
  if (!line) return;
  const current = line.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (
    current &&
    current.itemSize === 3 &&
    current.array instanceof Float32Array &&
    current.array.length === positions.length
  ) {
    if (current.array !== positions) {
      (current.array as Float32Array).set(positions);
    }
    current.needsUpdate = true;
  } else {
    line.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  }
  line.geometry.computeBoundingSphere();
  line.visible = true;
}

function hideLine(line: THREE.Line | null) {
  if (!line) return;
  line.visible = false;
}

function ensureMarker(
  scene: THREE.Scene | null,
  markerRef: MutableRefObject<THREE.Mesh | null>,
  color: number
) {
  if (!scene) return null;
  if (!markerRef.current) {
    const geometry = new THREE.SphereGeometry(2.2, 18, 18);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.1,
      depthTest: false,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.renderOrder = 12;
    scene.add(marker);
    markerRef.current = marker;
  }
  return markerRef.current;
}

function setMarkerAtPick(
  markerRef: MutableRefObject<THREE.Mesh | null>,
  pick: DemProfilePick,
  grid: DemGridData | null,
  terrain: THREE.Mesh | null
) {
  const marker = markerRef.current;
  if (!marker || !grid || !terrain) return;
  const local = new THREE.Vector3(
    pick.local.x,
    pick.local.y,
    sampleSurfaceZ(pick.local, grid) + PROFILE_LIFT + 0.7
  );
  marker.position.copy(terrain.localToWorld(local));
  marker.visible = true;
}

function clearProfileVisuals(
  scene: THREE.Scene | null,
  mainLineRef: MutableRefObject<THREE.Line | null>,
  guideLineRef: MutableRefObject<THREE.Line | null>,
  startMarkerRef: MutableRefObject<THREE.Mesh | null>,
  endMarkerRef: MutableRefObject<THREE.Mesh | null>
) {
  if (!scene) return;

  if (mainLineRef.current) {
    scene.remove(mainLineRef.current);
    disposeLine(mainLineRef.current);
    mainLineRef.current = null;
  }

  if (guideLineRef.current) {
    scene.remove(guideLineRef.current);
    disposeLine(guideLineRef.current);
    guideLineRef.current = null;
  }

  if (startMarkerRef.current) {
    scene.remove(startMarkerRef.current);
    disposeMarker(startMarkerRef.current);
    startMarkerRef.current = null;
  }

  if (endMarkerRef.current) {
    scene.remove(endMarkerRef.current);
    disposeMarker(endMarkerRef.current);
    endMarkerRef.current = null;
  }
}

function buildTerrainLinePositions(
  start: DemLocalPoint,
  end: DemLocalPoint,
  grid: DemGridData,
  terrain: THREE.Mesh
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = Math.max(36, Math.ceil(Math.hypot(dx, dy) * 1.5));
  const positions = new Float32Array((steps + 1) * 3);

  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const localPoint = {
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
    };
    const local = new THREE.Vector3(
      localPoint.x,
      localPoint.y,
      sampleSurfaceZ(localPoint, grid) + PROFILE_LIFT
    );
    const world = terrain.localToWorld(local);
    const base = index * 3;
    positions[base] = world.x;
    positions[base + 1] = world.y;
    positions[base + 2] = world.z;
  }
  return positions;
}

function fillGuideLinePositions(buffer: Float32Array, start: THREE.Vector3, end: THREE.Vector3) {
  buffer[0] = start.x;
  buffer[1] = start.y + PROFILE_LIFT;
  buffer[2] = start.z;
  buffer[3] = end.x;
  buffer[4] = end.y + PROFILE_LIFT;
  buffer[5] = end.z;
  return buffer;
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
  const metaItems = [
    `SIZE: ${workerResult.sourceWidth}x${workerResult.sourceHeight}`,
    `CRS : ${workerResult.crs || "알 수 없음"}`,
    `GSD : ${workerResult.resolutionXMeter.toFixed(2)}m x ${workerResult.resolutionYMeter.toFixed(2)}m`,
  ];

  return {
    terrain,
    sourceMeta: metaItems,
    minElevation: workerResult.minElevation,
    maxElevation: workerResult.maxElevation,
    grid: {
      width: workerResult.width,
      height: workerResult.height,
      planeWidth: workerResult.width,
      planeHeight: workerResult.height,
      resolutionXMeter: workerResult.resolutionXMeter,
      resolutionYMeter: workerResult.resolutionYMeter,
      elevations,
      zSurface: zValues,
    } satisfies DemGridData,
  };
}

function hintText(start: DemProfilePick | null, end: DemProfilePick | null) {
  if (!start) return "클릭하여 시작점을 지정하세요.";
  if (start && !end) return "클릭하여 끝점을 지정하세요.";
  return "측정이 완료되었습니다. 초기화 후 다시 측정하세요.";
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
  const profileGuideLineRef = useRef<THREE.Line | null>(null);
  const profileStartMarkerRef = useRef<THREE.Mesh | null>(null);
  const profileEndMarkerRef = useRef<THREE.Mesh | null>(null);
  const profileStartRef = useRef<DemProfilePick | null>(null);
  const profileEndRef = useRef<DemProfilePick | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const guidePositionsRef = useRef<Float32Array>(new Float32Array(6));
  const moveFrameRef = useRef<number>(0);
  const pendingMoveRef = useRef<{ x: number; y: number; buttons: number } | null>(null);
  const lastHintRef = useRef<ProfileHintState | null>(null);

  const [loading, setLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [profileHint, setProfileHint] = useState<ProfileHintState | null>(null);
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
      if (moveFrameRef.current) {
        window.cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = 0;
      }

      if (terrainRef.current) {
        scene.remove(terrainRef.current);
        disposeMesh(terrainRef.current);
        terrainRef.current = null;
      }

      clearProfileVisuals(
        scene,
        profileLineRef,
        profileGuideLineRef,
        profileStartMarkerRef,
        profileEndMarkerRef
      );

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
    pointerDownRef.current = null;
    pendingMoveRef.current = null;
    onProfileChange?.(null);
    setProfileHint(null);
    lastHintRef.current = null;

    clearProfileVisuals(
      scene,
      profileLineRef,
      profileGuideLineRef,
      profileStartMarkerRef,
      profileEndMarkerRef
    );

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
    const scene = sceneRef.current;
    if (!scene) return;
    profileStartRef.current = null;
    profileEndRef.current = null;
    pointerDownRef.current = null;
    pendingMoveRef.current = null;
    onProfileChange?.(null);

    clearProfileVisuals(
      scene,
      profileLineRef,
      profileGuideLineRef,
      profileStartMarkerRef,
      profileEndMarkerRef
    );

    setProfileHint((current) => {
      if (!profileEnabled || !current) return null;
      return {
        ...current,
        text: hintText(null, null),
      };
    });
    lastHintRef.current = null;
  }, [profileResetKey, profileEnabled, onProfileChange]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (!profileEnabled) {
      setProfileHint(null);
      lastHintRef.current = null;
      pointerDownRef.current = null;
      pendingMoveRef.current = null;
      return;
    }

    const applyHintState = (next: ProfileHintState | null) => {
      const prev = lastHintRef.current;
      if (!next && !prev) return;
      if (
        next &&
        prev &&
        next.text === prev.text &&
        Math.abs(next.x - prev.x) < HINT_MIN_MOVE_PX &&
        Math.abs(next.y - prev.y) < HINT_MIN_MOVE_PX
      ) {
        return;
      }
      lastHintRef.current = next;
      setProfileHint(next);
    };

    const updateHintAtCursor = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
        applyHintState(null);
        return;
      }

      applyHintState({
        x: clamp(localX + 14, 8, rect.width - 8),
        y: clamp(localY - 12, 8, rect.height - 8),
        text: hintText(profileStartRef.current, profileEndRef.current),
      });
    };

    const pickOnTerrain = (clientX: number, clientY: number): DemProfilePick | null => {
      const camera = cameraRef.current;
      const terrain = terrainRef.current;
      if (!camera || !terrain) return null;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const pointer = pointerRef.current;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(terrain, false);
      if (!hits.length) return null;

      const world = hits[0].point.clone();
      const local = terrain.worldToLocal(world.clone());
      return { world, local: { x: local.x, y: local.y } };
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pointerDown = pointerDownRef.current;
      if (pointerDown) {
        const dx = event.clientX - pointerDown.x;
        const dy = event.clientY - pointerDown.y;
        if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) {
          pointerDown.moved = true;
        }
      }

      pendingMoveRef.current = {
        x: event.clientX,
        y: event.clientY,
        buttons: event.buttons,
      };

      if (moveFrameRef.current) return;
      moveFrameRef.current = window.requestAnimationFrame(() => {
        moveFrameRef.current = 0;
        const pending = pendingMoveRef.current;
        if (!pending) return;

        updateHintAtCursor(pending.x, pending.y);

        if ((pending.buttons & 1) === 1) {
          return;
        }

        const start = profileStartRef.current;
        const end = profileEndRef.current;
        if (!start || end) return;

        const picked = pickOnTerrain(pending.x, pending.y);
        if (!picked) return;
        const scene = sceneRef.current;
        const guideLine = ensureProfileLine(scene, profileGuideLineRef, 0x74b4ff);
        setLinePositions(
          guideLine,
          fillGuideLinePositions(guidePositionsRef.current, start.world, picked.world)
        );
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      updateHintAtCursor(event.clientX, event.clientY);

      const pointerDown = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!pointerDown || pointerDown.moved) return;

      const start = profileStartRef.current;
      const end = profileEndRef.current;
      if (start && end) return;

      const picked = pickOnTerrain(event.clientX, event.clientY);
      if (!picked) return;

      const scene = sceneRef.current;
      const terrain = terrainRef.current;
      const grid = gridDataRef.current;
      if (!scene || !terrain || !grid) return;

      if (!start) {
        profileStartRef.current = picked;
        profileEndRef.current = null;
        onProfileChange?.(null);
        hideLine(profileLineRef.current);
        hideLine(profileGuideLineRef.current);

        const startMarker = ensureMarker(scene, profileStartMarkerRef, 0x2f87ff);
        const endMarker = ensureMarker(scene, profileEndMarkerRef, 0xffa940);
        if (endMarker) {
          endMarker.visible = false;
        }
        if (startMarker) {
          setMarkerAtPick(profileStartMarkerRef, picked, grid, terrain);
        }
        if (lastHintRef.current) {
          applyHintState({
            ...lastHintRef.current,
            text: hintText(profileStartRef.current, profileEndRef.current),
          });
        }
        return;
      }

      profileEndRef.current = picked;
      const endMarker = ensureMarker(scene, profileEndMarkerRef, 0xffa940);
      if (endMarker) {
        setMarkerAtPick(profileEndMarkerRef, picked, grid, terrain);
      }

      hideLine(profileGuideLineRef.current);
      const finalLine = ensureProfileLine(scene, profileLineRef, 0x57a5ff);
      const terrainLine = buildTerrainLinePositions(start.local, picked.local, grid, terrain);
      setLinePositions(finalLine, terrainLine);

      const profile: DemProfileResult = buildLineProfile(start.local, picked.local, grid);
      onProfileChange?.(profile);

      if (lastHintRef.current) {
        applyHintState({
          ...lastHintRef.current,
          text: hintText(profileStartRef.current, profileEndRef.current),
        });
      }
    };

    const handlePointerLeave = () => {
      applyHintState(null);
      pointerDownRef.current = null;
      pendingMoveRef.current = null;
      if (moveFrameRef.current) {
        window.cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = 0;
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      if (moveFrameRef.current) {
        window.cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = 0;
      }
      pendingMoveRef.current = null;
    };
  }, [profileEnabled, onProfileChange]);

  return (
    <div className="dem-viewport">
      <div ref={containerRef} className="dem-canvas" />
      {loading ? <div className="dem-status">지형 렌더링 중...</div> : null}
      {viewerError ? <div className="dem-error">{viewerError}</div> : null}
      {profileEnabled && profileHint ? (
        <div
          className="dem-profile-hint"
          style={{
            left: `${profileHint.x}px`,
            top: `${profileHint.y}px`,
          }}
        >
          {profileHint.text}
        </div>
      ) : null}
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
