import { useEffect, useMemo, useRef, useState, useCallback, type MutableRefObject } from "react";
import * as THREE from "three-legacy";
import { OrbitControls } from "three-legacy/examples/jsm/controls/OrbitControls.js";

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
  viewResetKey?: number;
  maxGridSize?: number;
  heightScale?: number;
  verticalExaggeration?: number;
  elevationGamma?: number;
  profileEnabled?: boolean;
  profileResetKey?: number;
  onMetaChange?: (meta: string[] | null) => void;
  onProfileChange?: (profile: DemProfileResult | null) => void;
  onProfileHoverHandlerReady?: (handler: (ratio: number | null) => void) => void;
  onProfileFocusHandlerReady?: (handler: (ratio: number | null) => void) => void;
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

type CameraFocusAnimation = {
  startTime: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};

const PROFILE_LIFT = 1.4;
const PROFILE_FOCUS_DURATION_MS = 420;
const PROFILE_FOCUS_ZOOM_FACTOR = 0.7;
const CLICK_MOVE_THRESHOLD = 6;
const HINT_MIN_MOVE_PX = 2;

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(1000, 1000, 1000);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
const MIN_DISTANCE_ABS = 5;
const MIN_DISTANCE_FACTOR = 0.02;
const MAX_DISTANCE_FACTOR = 18;
const FIT_DISTANCE_FACTOR = 2.6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tuneControls(controls: OrbitControls) {
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 1.05;
  controls.screenSpacePanning = true;
}

function easeInOutCubic(value: number) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function updateCameraFocusAnimation(
  animationRef: MutableRefObject<CameraFocusAnimation | null>,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  now: number,
  autoRotateEnabled: boolean,
  requestRender: () => void
) {
  const animation = animationRef.current;
  if (!animation) {
    controls.autoRotate = autoRotateEnabled;
    return;
  }

  const progress = animation.duration <= 0
    ? 1
    : clamp((now - animation.startTime) / animation.duration, 0, 1);
  const eased = easeInOutCubic(progress);

  camera.position.set(
    animation.fromPosition.x + (animation.toPosition.x - animation.fromPosition.x) * eased,
    animation.fromPosition.y + (animation.toPosition.y - animation.fromPosition.y) * eased,
    animation.fromPosition.z + (animation.toPosition.z - animation.fromPosition.z) * eased,
  );
  controls.target.set(
    animation.fromTarget.x + (animation.toTarget.x - animation.fromTarget.x) * eased,
    animation.fromTarget.y + (animation.toTarget.y - animation.fromTarget.y) * eased,
    animation.fromTarget.z + (animation.toTarget.z - animation.fromTarget.z) * eased,
  );
  controls.autoRotate = false;
  requestRender();

  if (progress >= 1) {
    animationRef.current = null;
    controls.autoRotate = autoRotateEnabled;
  }
}

function enforceCameraDistance(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  requestRender: () => void
) {
  const toCamera = camera.position.clone().sub(controls.target);
  const distance = toCamera.length();
  if (!Number.isFinite(distance) || distance <= 0) return;

  let nextDistance = distance;
  if (distance < controls.minDistance) nextDistance = controls.minDistance;
  if (distance > controls.maxDistance) nextDistance = controls.maxDistance;
  if (nextDistance === distance) return;

  toCamera.setLength(nextDistance);
  camera.position.copy(controls.target).add(toCamera);
  requestRender();
}

function fitCameraToTerrain(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  terrain: THREE.Object3D,
  requestRender: () => void
) {
  const box = new THREE.Box3().setFromObject(terrain);
  if (box.isEmpty()) {
    return;
  }

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1);
  controls.minDistance = Math.max(MIN_DISTANCE_ABS, radius * MIN_DISTANCE_FACTOR);
  controls.maxDistance = Math.max(1500, radius * MAX_DISTANCE_FACTOR);

  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.0001) {
    direction.copy(DEFAULT_CAMERA_POSITION).normalize();
  } else {
    direction.normalize();
  }

  const fitDistance = Math.max(radius * FIT_DISTANCE_FACTOR, controls.minDistance * 1.5);
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(direction.multiplyScalar(fitDistance));
  camera.near = Math.max(0.1, radius / 5000);
  camera.far = Math.max(10000, radius * 80);
  camera.updateProjectionMatrix();
  controls.update();
  requestRender();
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
  const vertexCount = width * height;
  if (!Number.isFinite(vertexCount) || vertexCount <= 0) {
    throw new Error("Invalid DEM grid size.");
  }

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

function formatDistanceLabel(distanceMeter: number) {
  if (!Number.isFinite(distanceMeter)) return "-";
  if (distanceMeter >= 1000) return `${(distanceMeter / 1000).toFixed(2)} km`;
  return `${distanceMeter.toFixed(1)} m`;
}

function projectToViewport(
  world: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
) {
  const projected = world.clone().project(camera);
  if (projected.z < -1 || projected.z > 1) {
    return null;
  }

  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const x = ((projected.x + 1) * 0.5) * width;
  const y = ((1 - projected.y) * 0.5) * height;
  if (x < 0 || y < 0 || x > width || y > height) {
    return null;
  }

  return { x, y };
}

function hideOverlayLabel(element: HTMLDivElement | null) {
  if (!element) return;
  if (element.style.display !== "none") {
    element.style.display = "none";
  }
}

function setOverlayLabel(
  element: HTMLDivElement | null,
  x: number,
  y: number,
  text: string
) {
  if (!element) return;
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  const nextLeft = `${roundedX}px`;
  const nextTop = `${roundedY}px`;
  if (element.style.display !== "block") {
    element.style.display = "block";
  }
  if (element.style.left !== nextLeft) {
    element.style.left = nextLeft;
  }
  if (element.style.top !== nextTop) {
    element.style.top = nextTop;
  }
  if (element.textContent !== text) {
    element.textContent = text;
  }
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
      linewidth: 2,
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

function setMarkerAtLocalPoint(
  markerRef: MutableRefObject<THREE.Mesh | null>,
  localPoint: DemLocalPoint,
  grid: DemGridData | null,
  terrain: THREE.Mesh | null,
  lift: number
) {
  const marker = markerRef.current;
  if (!marker || !grid || !terrain) return;
  const local = new THREE.Vector3(
    localPoint.x,
    localPoint.y,
    sampleSurfaceZ(localPoint, grid) + lift
  );
  marker.position.copy(terrain.localToWorld(local));
  marker.visible = true;
}

function setMarkerAtPick(
  markerRef: MutableRefObject<THREE.Mesh | null>,
  pick: DemProfilePick,
  grid: DemGridData | null,
  terrain: THREE.Mesh | null
) {
  setMarkerAtLocalPoint(markerRef, pick.local, grid, terrain, PROFILE_LIFT + 0.7);
}

function hideMarker(markerRef: MutableRefObject<THREE.Mesh | null>) {
  if (!markerRef.current) return;
  markerRef.current.visible = false;
}

function clearProfileVisuals(
  scene: THREE.Scene | null,
  mainLineRef: MutableRefObject<THREE.Line | null>,
  guideLineRef: MutableRefObject<THREE.Line | null>,
  startMarkerRef: MutableRefObject<THREE.Mesh | null>,
  endMarkerRef: MutableRefObject<THREE.Mesh | null>,
  hoverMarkerRef: MutableRefObject<THREE.Mesh | null>
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

  if (hoverMarkerRef.current) {
    scene.remove(hoverMarkerRef.current);
    disposeMarker(hoverMarkerRef.current);
    hoverMarkerRef.current = null;
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
  signal: AbortSignal,
  maxGridSize: number,
  heightScale: number,
  verticalExaggeration: number,
  elevationGamma: number
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

    worker.postMessage(
      { arrayBuffer, maxGridSize, heightScale, verticalExaggeration, elevationGamma },
      [arrayBuffer]
    );
  });
}

async function loadDemFromSource(
  source: DemViewerSource,
  signal: AbortSignal,
  maxGridSize: number,
  heightScale: number,
  verticalExaggeration: number,
  elevationGamma: number
) {
  const arrayBuffer = await readSourceArrayBuffer(source, signal);
  const workerResult = await runDemWorker(
    arrayBuffer,
    signal,
    maxGridSize,
    heightScale,
    verticalExaggeration,
    elevationGamma
  );
  if (!workerResult.ok) {
    throw new Error(workerResult.error);
  }

  const elevations = new Float32Array(workerResult.elevations);
  const zValues = new Float32Array(workerResult.zValues);
  const colors = new Float32Array(workerResult.colors);
  const terrain = createDemMesh(workerResult.width, workerResult.height, zValues, colors);
  const metaItems = [
    `SIZE: ${workerResult.sourceWidth}x${workerResult.sourceHeight}`,
    `CRS : ${workerResult.crs || "정보 없음"}`,
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
  if (!start) return "클릭하여 P1점을 지정하세요.";
  if (start && !end) return "클릭하여 P2점을 지정하세요.";
  return "측정이 완료되었습니다. 초기화 후 다시 측정하세요.";
}

export function DemViewport({
  seedKey,
  source,
  autoRotate = true,
  viewResetKey = 0,
  maxGridSize = 0,
  heightScale = 0.02,
  verticalExaggeration = 20.0,
  elevationGamma = 1.5,
  profileEnabled = false,
  profileResetKey = 0,
  onMetaChange,
  onProfileChange,
  onProfileHoverHandlerReady,
  onProfileFocusHandlerReady,
}: DemViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);
  const autoRotateRef = useRef<boolean>(autoRotate);
  const needsRenderRef = useRef<boolean>(true);
  const gridDataRef = useRef<DemGridData | null>(null);
  const profileLineRef = useRef<THREE.Line | null>(null);
  const profileGuideLineRef = useRef<THREE.Line | null>(null);
  const profileStartMarkerRef = useRef<THREE.Mesh | null>(null);
  const profileEndMarkerRef = useRef<THREE.Mesh | null>(null);
  const profileHoverMarkerRef = useRef<THREE.Mesh | null>(null);
  const profileFocusAnimationRef = useRef<CameraFocusAnimation | null>(null);
  const profileStartRef = useRef<DemProfilePick | null>(null);
  const profileEndRef = useRef<DemProfilePick | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const guidePositionsRef = useRef<Float32Array>(new Float32Array(6));
  const moveFrameRef = useRef<number>(0);
  const pendingMoveRef = useRef<{ x: number; y: number; buttons: number } | null>(null);
  const lastHintRef = useRef<ProfileHintState | null>(null);
  const profileEnabledRef = useRef<boolean>(profileEnabled);
  const profileDistanceTextRef = useRef<string | null>(null);
  const startLabelRef = useRef<HTMLDivElement | null>(null);
  const endLabelRef = useRef<HTMLDivElement | null>(null);
  const distanceLabelRef = useRef<HTMLDivElement | null>(null);

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

  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  const updateViewerProfileLabels = useCallback(() => {
    if (!profileEnabledRef.current) {
      hideOverlayLabel(startLabelRef.current);
      hideOverlayLabel(endLabelRef.current);
      hideOverlayLabel(distanceLabelRef.current);
      return;
    }

    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const start = profileStartRef.current;
    const end = profileEndRef.current;
    const distanceText = profileDistanceTextRef.current;

    if (!camera || !renderer || !start || !end || !distanceText) {
      hideOverlayLabel(startLabelRef.current);
      hideOverlayLabel(endLabelRef.current);
      hideOverlayLabel(distanceLabelRef.current);
      return;
    }

    const startAnchor = profileStartMarkerRef.current?.visible
      ? profileStartMarkerRef.current.position
      : start.world;
    const endAnchor = profileEndMarkerRef.current?.visible
      ? profileEndMarkerRef.current.position
      : end.world;
    const distanceAnchor = startAnchor.clone().add(endAnchor).multiplyScalar(0.5);
    distanceAnchor.y += 2.4;

    const startPos = projectToViewport(startAnchor, camera, renderer);
    const endPos = projectToViewport(endAnchor, camera, renderer);
    const distancePos = projectToViewport(distanceAnchor, camera, renderer);
    if (startPos) {
      setOverlayLabel(startLabelRef.current, startPos.x, startPos.y, "P1");
    } else {
      hideOverlayLabel(startLabelRef.current);
    }
    if (endPos) {
      setOverlayLabel(endLabelRef.current, endPos.x, endPos.y, "P2");
    } else {
      hideOverlayLabel(endLabelRef.current);
    }
    if (distancePos) {
      setOverlayLabel(distanceLabelRef.current, distancePos.x, distancePos.y - 10, distanceText);
    } else {
      hideOverlayLabel(distanceLabelRef.current);
    }
  }, []);

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
    camera.position.copy(DEFAULT_CAMERA_POSITION);
    camera.lookAt(DEFAULT_CAMERA_TARGET);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0xd3d3d3);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = true;
    controls.maxDistance = 1500;
    controls.minDistance = MIN_DISTANCE_ABS;
    controls.autoRotate = autoRotate;
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    tuneControls(controls);
    controls.update();
    controlsRef.current = controls;
    const handleControlsChange = () => {
      requestRender();
    };
    controls.addEventListener("change", handleControlsChange);

    const handleDoubleClick = () => {
      const terrain = terrainRef.current;
      if (terrain) {
        fitCameraToTerrain(camera, controls, terrain, requestRender);
        return;
      }
      controls.target.copy(DEFAULT_CAMERA_TARGET);
      camera.position.copy(DEFAULT_CAMERA_POSITION);
      camera.lookAt(DEFAULT_CAMERA_TARGET);
      controls.update();
      requestRender();
    };
    renderer.domElement.addEventListener("dblclick", handleDoubleClick);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(500, 1000, 250);
    scene.add(light);

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
      requestRender();
    });
    resizeObserver.observe(container);

    const renderLoop = (time: number) => {
      updateCameraFocusAnimation(
        profileFocusAnimationRef,
        camera,
        controls,
        time,
        autoRotateRef.current,
        requestRender
      );
      controls.update();
      enforceCameraDistance(camera, controls, requestRender);
      updateViewerProfileLabels();
      renderer.render(scene, camera);
      needsRenderRef.current = false;
      frameRef.current = window.requestAnimationFrame(renderLoop);
    };
    requestRender();
    frameRef.current = window.requestAnimationFrame(renderLoop);

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
        profileEndMarkerRef,
        profileHoverMarkerRef
      );

      renderer.domElement.removeEventListener("dblclick", handleDoubleClick);
      controls.removeEventListener("change", handleControlsChange);
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      profileFocusAnimationRef.current = null;
    };
  }, []);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
    if (!controlsRef.current) return;
    if (!profileFocusAnimationRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
    requestRender();
  }, [autoRotate, requestRender]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const terrain = terrainRef.current;
    if (terrain) {
      fitCameraToTerrain(camera, controls, terrain, requestRender);
      return;
    }

    controls.minDistance = MIN_DISTANCE_ABS;
    controls.maxDistance = 1500;
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    camera.position.copy(DEFAULT_CAMERA_POSITION);
    camera.lookAt(DEFAULT_CAMERA_TARGET);
    camera.near = 0.1;
    camera.far = 10000;
    camera.updateProjectionMatrix();
    controls.update();
    requestRender();
  }, [viewResetKey, requestRender]);

  useEffect(() => {
    profileEnabledRef.current = profileEnabled;
    if (!profileEnabled) {
      hideOverlayLabel(startLabelRef.current);
      hideOverlayLabel(endLabelRef.current);
      hideOverlayLabel(distanceLabelRef.current);
    }
    requestRender();
  }, [profileEnabled, requestRender]);

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
    profileDistanceTextRef.current = null;
    hideOverlayLabel(startLabelRef.current);
    hideOverlayLabel(endLabelRef.current);
    hideOverlayLabel(distanceLabelRef.current);
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
        profileEndMarkerRef,
        profileHoverMarkerRef
      );
    requestRender();

    if (!source) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        controls.minDistance = MIN_DISTANCE_ABS;
        controls.maxDistance = 1500;
        controls.target.copy(DEFAULT_CAMERA_TARGET);
        camera.position.copy(DEFAULT_CAMERA_POSITION);
        camera.lookAt(DEFAULT_CAMERA_TARGET);
        camera.near = 0.1;
        camera.far = 10000;
        camera.updateProjectionMatrix();
        controls.update();
      }
      setLoading(false);
      setViewerError(null);
      setElevationRange(null);
      profileDistanceTextRef.current = null;
      hideOverlayLabel(startLabelRef.current);
      hideOverlayLabel(endLabelRef.current);
      hideOverlayLabel(distanceLabelRef.current);
      gridDataRef.current = null;
      onMetaChange?.(null);
      requestRender();
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setViewerError(null);

    loadDemFromSource(
      source,
      controller.signal,
      maxGridSize,
      heightScale,
      verticalExaggeration,
      elevationGamma
    )
      .then(({ terrain, sourceMeta, minElevation, maxElevation, grid }) => {
        if (cancelled) {
          disposeMesh(terrain);
          return;
        }
        terrainRef.current = terrain;
        scene.add(terrain);
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) {
          fitCameraToTerrain(camera, controls, terrain, requestRender);
        }
        gridDataRef.current = grid;
        setElevationRange({ min: minElevation, max: maxElevation });
        onMetaChange?.(sourceMeta);
        requestRender();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setElevationRange(null);
        gridDataRef.current = null;
        onMetaChange?.(null);
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : "DEM 로드에 실패했습니다.";
        setViewerError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    source,
    sourceKey,
    maxGridSize,
    heightScale,
    verticalExaggeration,
    elevationGamma,
    onMetaChange,
    onProfileChange,
    requestRender,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    profileStartRef.current = null;
    profileEndRef.current = null;
    profileDistanceTextRef.current = null;
    hideOverlayLabel(startLabelRef.current);
    hideOverlayLabel(endLabelRef.current);
    hideOverlayLabel(distanceLabelRef.current);
    pointerDownRef.current = null;
    pendingMoveRef.current = null;
    onProfileChange?.(null);

    clearProfileVisuals(
        scene,
        profileLineRef,
        profileGuideLineRef,
        profileStartMarkerRef,
        profileEndMarkerRef,
        profileHoverMarkerRef
      );
    requestRender();

    setProfileHint((current) => {
      if (!profileEnabled || !current) return null;
      return {
        ...current,
        text: hintText(null, null),
      };
    });
    lastHintRef.current = null;
  }, [profileResetKey, profileEnabled, onProfileChange, requestRender]);

  useEffect(() => {
    if (!onProfileHoverHandlerReady) return;

    const handler = (ratio: number | null) => {
      const scene = sceneRef.current;
      const terrain = terrainRef.current;
      const grid = gridDataRef.current;
      const start = profileStartRef.current;
      const end = profileEndRef.current;

      if (
        ratio === null ||
        !scene ||
        !terrain ||
        !grid ||
        !start ||
        !end ||
        !Number.isFinite(ratio)
      ) {
        hideMarker(profileHoverMarkerRef);
        requestRender();
        return;
      }

      const hoverMarker = ensureMarker(scene, profileHoverMarkerRef, 0xe6f4ff);
      if (!hoverMarker) {
        return;
      }

      const clampedRatio = clamp(ratio, 0, 1);
      const localPoint: DemLocalPoint = {
        x: start.local.x + (end.local.x - start.local.x) * clampedRatio,
        y: start.local.y + (end.local.y - start.local.y) * clampedRatio,
      };

      setMarkerAtLocalPoint(profileHoverMarkerRef, localPoint, grid, terrain, PROFILE_LIFT + 1.1);
      requestRender();
    };

    onProfileHoverHandlerReady(handler);

    return () => {
      onProfileHoverHandlerReady(() => {});
    };
  }, [onProfileHoverHandlerReady, requestRender]);

  useEffect(() => {
    if (!onProfileFocusHandlerReady) return;

    const handler = (ratio: number | null) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const terrain = terrainRef.current;
      const grid = gridDataRef.current;
      const start = profileStartRef.current;
      const end = profileEndRef.current;

      if (
        ratio === null ||
        !camera ||
        !controls ||
        !terrain ||
        !grid ||
        !start ||
        !end ||
        !Number.isFinite(ratio)
      ) {
        return;
      }

      const clampedRatio = clamp(ratio, 0, 1);
      const localPoint: DemLocalPoint = {
        x: start.local.x + (end.local.x - start.local.x) * clampedRatio,
        y: start.local.y + (end.local.y - start.local.y) * clampedRatio,
      };

      const targetLocal = new THREE.Vector3(
        localPoint.x,
        localPoint.y,
        sampleSurfaceZ(localPoint, grid) + PROFILE_LIFT + 0.8
      );
      const nextTarget = terrain.localToWorld(targetLocal);
      const currentPosition = new THREE.Vector3(
        camera.position.x,
        camera.position.y,
        camera.position.z,
      );
      const currentTarget = new THREE.Vector3(
        controls.target.x,
        controls.target.y,
        controls.target.z,
      );
      const currentOffset = currentPosition.clone().sub(currentTarget);
      const fallbackDistance = Math.max(controls.minDistance * 1.8, 120);
      const currentDistance = currentOffset.length() || fallbackDistance;
      const nextDistance = clamp(
        currentDistance * PROFILE_FOCUS_ZOOM_FACTOR,
        Math.max(controls.minDistance * 1.15, MIN_DISTANCE_ABS * 2),
        Math.max(controls.minDistance * 1.8, controls.maxDistance * 0.22)
      );

      if (currentOffset.lengthSq() < 0.0001) {
        currentOffset.copy(DEFAULT_CAMERA_POSITION).normalize().multiplyScalar(nextDistance);
      } else {
        currentOffset.setLength(nextDistance);
      }

      profileFocusAnimationRef.current = {
        startTime: performance.now(),
        duration: PROFILE_FOCUS_DURATION_MS,
        fromPosition: currentPosition,
        toPosition: nextTarget.clone().add(currentOffset),
        fromTarget: currentTarget,
        toTarget: nextTarget.clone(),
      };
      requestRender();
    };

    onProfileFocusHandlerReady(handler);

    return () => {
      onProfileFocusHandlerReady(() => {});
    };
  }, [onProfileFocusHandlerReady, requestRender]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (!profileEnabled) {
      setProfileHint(null);
      lastHintRef.current = null;
      profileDistanceTextRef.current = null;
      hideOverlayLabel(startLabelRef.current);
      hideOverlayLabel(endLabelRef.current);
      hideOverlayLabel(distanceLabelRef.current);
      pointerDownRef.current = null;
      pendingMoveRef.current = null;
      hideMarker(profileHoverMarkerRef);
      requestRender();
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
        requestRender();
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
        profileDistanceTextRef.current = null;
        hideOverlayLabel(startLabelRef.current);
        hideOverlayLabel(endLabelRef.current);
        hideOverlayLabel(distanceLabelRef.current);
        onProfileChange?.(null);
        hideLine(profileLineRef.current);
        hideLine(profileGuideLineRef.current);
        hideMarker(profileHoverMarkerRef);

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
        requestRender();
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
      profileDistanceTextRef.current = formatDistanceLabel(profile.totalDistanceMeter);
      onProfileChange?.(profile);
      updateViewerProfileLabels();
      requestRender();

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
  }, [profileEnabled, onProfileChange, updateViewerProfileLabels, requestRender]);

  return (
    <div className="dem-viewport">
      <div ref={containerRef} className="dem-canvas" />
      {loading ? (<div className="dem-status">{"지형 데이터 로딩 중..."}</div>) : null}
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
      <div ref={startLabelRef} className="dem-profile-anchor dem-profile-anchor-start" />
      <div ref={endLabelRef} className="dem-profile-anchor dem-profile-anchor-end" />
      <div ref={distanceLabelRef} className="dem-profile-anchor dem-profile-anchor-distance" />
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


