import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type DemThreeViewportProps = {
  seedKey?: string | null;
};

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 100000);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mixColor(a: THREE.Color, b: THREE.Color, t: number) {
  return new THREE.Color(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

function buildTerrain(seed: number) {
  const geometry = new THREE.PlaneGeometry(220, 220, 220, 220);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const heights = new Float32Array(position.count);

  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);

    const radial = Math.max(0, 1 - Math.hypot(x, y) / 112);
    const ridge = Math.sin((x + seed) * 0.075) * Math.cos((y - seed) * 0.082);
    const detailA = Math.sin((x * 0.42 + y * 0.18 + seed) * 0.34);
    const detailB = Math.cos((x * 0.17 - y * 0.39 - seed) * 0.46);
    const peak = Math.pow(radial, 2.8) * 84;

    const height = peak + ridge * 13 + detailA * 5 + detailB * 4;
    heights[i] = height;
    min = Math.min(min, height);
    max = Math.max(max, height);
    position.setZ(i, height);
  }

  const colorAttr = new Float32Array(position.count * 3);
  const low = new THREE.Color("#6f6756");
  const mid = new THREE.Color("#4d5f45");
  const high = new THREE.Color("#2d3640");
  const peakColor = new THREE.Color("#25a7b0");

  for (let i = 0; i < position.count; i += 1) {
    const t = (heights[i] - min) / Math.max(1e-6, max - min);

    let color: THREE.Color;
    if (t < 0.34) {
      color = mixColor(low, mid, t / 0.34);
    } else if (t < 0.78) {
      color = mixColor(mid, high, (t - 0.34) / 0.44);
    } else {
      color = mixColor(high, peakColor, (t - 0.78) / 0.22);
    }

    colorAttr[i * 3] = color.r;
    colorAttr[i * 3 + 1] = color.g;
    colorAttr[i * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colorAttr, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.03,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

export function DemThreeViewport({ seedKey }: DemThreeViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#c7c7c7");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      46,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      2000
    );
    camera.position.set(142, 118, 152);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 20, 0);
    controls.update();
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight("#ffffff", 0.6);
    const keyLight = new THREE.DirectionalLight("#ffffff", 1.12);
    keyLight.position.set(140, 210, 110);
    const rimLight = new THREE.DirectionalLight("#8bb7ff", 0.36);
    rimLight.position.set(-110, 80, -140);

    scene.add(ambient, keyLight, rimLight);

    const grid = new THREE.GridHelper(360, 40, "#95a0b3", "#aab2c1");
    scene.add(grid);

    const axis = new THREE.AxesHelper(80);
    scene.add(axis);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      cameraRef.current.aspect = nextWidth / Math.max(1, nextHeight);
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(container);

    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    tick();

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameRef.current);

      terrainRef.current?.geometry.dispose();
      (terrainRef.current?.material as THREE.Material | undefined)?.dispose();
      terrainRef.current = null;

      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);

      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (terrainRef.current) {
      scene.remove(terrainRef.current);
      terrainRef.current.geometry.dispose();
      (terrainRef.current.material as THREE.Material).dispose();
      terrainRef.current = null;
    }

    const seed = hashSeed(seedKey || "default-dem");
    const terrain = buildTerrain(seed);
    terrainRef.current = terrain;
    scene.add(terrain);
  }, [seedKey]);

  return <div ref={containerRef} className="dem-three-viewport" />;
}
