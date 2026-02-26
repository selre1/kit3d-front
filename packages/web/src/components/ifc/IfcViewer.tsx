import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  Button,
  Checkbox,
  Collapse,
  Empty,
  Progress,
  Spin,
} from "antd";
import {
  AimOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons";

import * as OBC from "@thatopen/components";
import * as THREE from "three";

type IfcViewerProps = {
  fileUrl?: string | null;
  active?: boolean;
};

type EntityGroups = Record<
  string,
  {
    map: Record<string, Set<number>>;
    name: string;
    id: number | null;
  }
>;

type CameraControlsApi = {
  setLookAt?: (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number
  ) => void;
  fitToBox?: (box: THREE.Box3, enableTransition?: boolean) => Promise<void> | void;
  fitToSphere?: (sphere: THREE.Sphere, enableTransition?: boolean) => Promise<void> | void;
  update?: (delta: number) => boolean;
};

export function IfcViewer({ fileUrl, active = true }: IfcViewerProps) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const worldRef = useRef<any | null>(null);
  const classifierRef = useRef<OBC.Classifier | null>(null);
  const hiderRef = useRef<OBC.Hider | null>(null);
  const ifcLoaderRef = useRef<OBC.IfcLoader | null>(null);
  const setupPromiseRef = useRef<Promise<void> | null>(null);
  const modelRef = useRef<unknown | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerProgress, setViewerProgress] = useState<number | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerEnabled, setViewerEnabled] = useState(false);
  const [enabledFileUrl, setEnabledFileUrl] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [entityGroups, setEntityGroups] = useState<EntityGroups | null>(null);
  const [entityVisibility, setEntityVisibility] = useState<Record<string, boolean>>({});
  const [classifierOpen, setClassifierOpen] = useState(false);

  const resetViewerState = () => {
    setViewerEnabled(false);
    setEnabledFileUrl(null);
    setViewerLoading(false);
    setViewerProgress(null);
    setViewerError(null);
    setModelReady(false);
    setEntityGroups(null);
    setEntityVisibility({});
    setClassifierOpen(false);
    setupPromiseRef.current = null;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (modelRef.current && worldRef.current) {
      worldRef.current.scene.three.remove(modelRef.current as never);
      modelRef.current = null;
    }
  };

  useEffect(() => {
    if (!active) {
      resetViewerState();
    }
  }, [active]);

  useEffect(() => {
    resetViewerState();
  }, [fileUrl]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const viewer = viewerRef.current;
      setIsFullscreen(Boolean(viewer && document.fullscreenElement === viewer));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !viewerEnabled) return;

    const components = new OBC.Components();
    componentsRef.current = components;

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();
    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);

    components.init();

    const scene = world.scene as unknown as {
      setup?: () => void;
      three?: { background: unknown };
    };
    scene.setup?.();

    const grids = components.get(OBC.Grids);
    grids.create(world);
    if (scene.three) {
      scene.three.background = new THREE.Color(0xffffff);
    }

    worldRef.current = world;

    const ifcLoader = components.get(OBC.IfcLoader);
    ifcLoaderRef.current = ifcLoader;
    setupPromiseRef.current = ifcLoader.setup();

    const classifier = components.get(OBC.Classifier);
    classifierRef.current = classifier;
    const hider = components.get(OBC.Hider);
    hiderRef.current = hider;

    const resizeObserver = new ResizeObserver(() => {
      const renderer = world.renderer as unknown as {
        resize?: () => void;
        three?: { setSize: (w: number, h: number, updateStyle?: boolean) => void };
      };
      if (renderer.resize) {
        renderer.resize();
      } else if (renderer.three) {
        renderer.three.setSize(container.clientWidth, container.clientHeight, false);
      }
    });
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    return () => {
      resizeObserver.disconnect();
      if (modelRef.current) {
        world.scene.three.remove(modelRef.current as never);
        modelRef.current = null;
      }
      const anyComponents = components as unknown as { dispose?: () => void };
      anyComponents.dispose?.();
      componentsRef.current = null;
      ifcLoaderRef.current = null;
      setupPromiseRef.current = null;
      worldRef.current = null;
      classifierRef.current = null;
      hiderRef.current = null;
    };
  }, [viewerEnabled]);

  useEffect(() => {
    if (!viewerEnabled) return;
    const ifcLoader = ifcLoaderRef.current;
    const world = worldRef.current;
    const resolvedUrl = fileUrl ?? null;
    if (!ifcLoader || !world || !resolvedUrl || enabledFileUrl !== fileUrl) {
      setViewerError(null);
      setViewerLoading(false);
      setModelReady(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    setViewerLoading(true);
    setViewerProgress(null);
    setViewerError(null);

    (async () => {
      await (setupPromiseRef.current ?? ifcLoader.setup());
      const response = await fetch(resolvedUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Failed to load IFC: ${response.status}`);
      }
      const total = Number(response.headers.get("Content-Length") ?? 0);
      let buffer: Uint8Array;
      if (!response.body || !total) {
        const data = await response.arrayBuffer();
        buffer = new Uint8Array(data);
        setViewerProgress(100);
      } else {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            setViewerProgress(Math.min(100, Math.round((received / total) * 100)));
          }
        }
        buffer = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
      }
      const model = await ifcLoader.load(buffer);
      if (cancelled) return;
      if (modelRef.current) {
        world.scene.three.remove(modelRef.current as never);
      }
      modelRef.current = model;
      world.scene.three.add(model as never);
      setModelReady(true);
      try {
        const classifier = classifierRef.current;
        if (classifier) {
          classifier.byEntity(model);
          const entities = classifier.list.entities ?? {};
          setEntityGroups(entities as EntityGroups);
          const nextVisibility: Record<string, boolean> = {};
          for (const key of Object.keys(entities)) {
            nextVisibility[key] = true;
          }
          setEntityVisibility(nextVisibility);
          hiderRef.current?.set(true);
        }
      } catch (err) {
        setEntityGroups(null);
        setEntityVisibility({});
      }
    })()
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setViewerError(err.message || "Failed to load IFC.");
        setModelReady(false);
      })
      .finally(() => {
        if (cancelled) return;
        setViewerLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      setViewerLoading(false);
      setViewerProgress(null);
      setModelReady(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [fileUrl, viewerEnabled, enabledFileUrl]);

  const handleFitModel = () => {
    const world = worldRef.current;
    const model = modelRef.current as THREE.Object3D | null;
    if (!world || !model) return;
    const controls = (world.camera as { controls?: CameraControlsApi } | undefined)?.controls;
    if (!controls) return;
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return;
    if (controls.fitToBox) {
      void controls.fitToBox(box, true);
    } else if (controls.fitToSphere) {
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      void controls.fitToSphere(sphere, true);
    }
  };

  const entityEntries = useMemo(() => {
    if (!entityGroups) return [];
    return Object.entries(entityGroups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [entityGroups]);

  const handleToggleEntity = (name: string, visible: boolean) => {
    const group = entityGroups?.[name];
    if (!group) return;
    setEntityVisibility((prev) => ({ ...prev, [name]: visible }));
    hiderRef.current?.set(visible, group.map);
  };

  const handleToggleFullscreen = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        void document.exitFullscreen();
      }
      return;
    }
    if (viewer.requestFullscreen) {
      void viewer.requestFullscreen();
    }
  };

  return (
    <div className="ifc-viewer" ref={viewerRef}>
      <div ref={containerRef} className="ifc-viewer-canvas" />
      {viewerEnabled && entityEntries.length ? (
        <div
          className="viewer-classifier"
          onMouseEnter={() => setClassifierOpen(true)}
          onMouseLeave={() => setClassifierOpen(false)}
        >
          <Collapse
            size="small"
            activeKey={classifierOpen ? ["entities"] : []}
            items={[
              {
                key: "entities",
                label: "IFC 분류 필터",
                children: (
                  <div className="viewer-classifier-list">
                    {entityEntries.map(([name]) => (
                      <Checkbox
                        key={name}
                        className="viewer-classifier-item"
                        checked={entityVisibility[name] ?? true}
                        onChange={(event) => handleToggleEntity(name, event.target.checked)}
                      >
                        {name}
                      </Checkbox>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : null}
      {viewerEnabled ? (
        <div className="ifc-viewer-toolbar">
          <Button
            size="small"
            type="text"
            icon={<AimOutlined />}
            onClick={handleFitModel}
            disabled={!modelReady}
          />
          <Button
            size="small"
            type="text"
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={handleToggleFullscreen}
          />
        </div>
      ) : null}
      {!fileUrl ? (
        <div className="ifc-viewer-placeholder">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No model selected" />
        </div>
      ) : null}
      {fileUrl && !viewerEnabled ? (
        <div className="ifc-viewer-placeholder">
          <Button
            size="small"
            type="primary"
            onClick={() => {
              setEnabledFileUrl(fileUrl ?? null);
              setViewerEnabled(true);
            }}
          >
            {"IFC 미리보기"}
          </Button>
        </div>
      ) : null}
      {viewerError ? <div className="ifc-viewer-error">{viewerError}</div> : null}
      {viewerEnabled && viewerLoading ? (
        <div className="ifc-viewer-overlay">
          {typeof viewerProgress === "number" ? (
            <Progress size="small" percent={viewerProgress} />
          ) : (
            <Spin size="small" />
          )}
        </div>
      ) : null}
    </div>
  );
}
