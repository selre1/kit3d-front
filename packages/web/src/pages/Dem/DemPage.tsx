import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { Button, InputNumber, Modal, Space, Tooltip, message } from "antd";

import {
  DemProfilePanel,
  DemSidebar,
  DemViewport,
  DemUploadModal,
} from "../../components/dem";
import type {
  DemItem,
  DemProfileResult,
  DemUploadSubmitPayload,
  DemViewerSource,
} from "../../components/dem";
import { apiGet, apiPost } from "../../tools/api";
import "../../components/dem/dem.css";

type DemUploadApiResponse = {
  dem_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number;
  created_at: string;
};

type DemListApiResponse = {
  dem_id: string;
  job_id?: string | null;
  file_name: string;
  file_path: string;
  file_url: string;
  file_size?: number | null;
  terrain_status?: string | null;
  terrain_download_url?: string | null;
  terrain_tileset_url?: string | null;
  created_at: string;
};

type DemConvertApiResponse = {
  job_id: string;
  dem_id: string;
  status: string;
  task_id: string;
};

function toViewerFileSource(file: File): DemViewerSource {
  return {
    mode: "file",
    file,
    object_url: URL.createObjectURL(file),
  };
}

function upsertDemItem(items: DemItem[], nextItem: DemItem): DemItem[] {
  const withoutCurrent = items.filter((item) => item.dem_id !== nextItem.dem_id);
  return [nextItem, ...withoutCurrent];
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function downloadFromUrl(url: string, fallbackFileName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const headerFileName = match?.[1]
    ? decodeURIComponent(match[1].replace(/['"]/g, "").trim())
    : null;
  triggerDownload(blob, headerFileName || fallbackFileName);
}

function parseErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "요청 처리에 실패했습니다.";
  }

  const text = error.message || "";
  try {
    const parsed = JSON.parse(text) as { detail?: string };
    return parsed.detail || "요청 처리에 실패했습니다.";
  } catch {
    return text || "요청 처리에 실패했습니다.";
  }
}

export function DemPage() {
  const [demItems, setDemItems] = useState<DemItem[]>([]);
  const [viewerSources, setViewerSources] = useState<Record<string, DemViewerSource>>({});
  const viewerSourcesRef = useRef<Record<string, DemViewerSource>>({});
  const [selectedDemId, setSelectedDemId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [maxGridSize, setMaxGridSize] = useState(1024);
  const [heightScale, setHeightScale] = useState(0.02);
  const [verticalExaggeration, setVerticalExaggeration] = useState(30.0);
  const [elevationGamma, setElevationGamma] = useState(1.5);
  const [gridSettingOpen, setGridSettingOpen] = useState(false);
  const [gridSettingValue, setGridSettingValue] = useState<number | null>(1024);
  const [heightScaleValue, setHeightScaleValue] = useState<number | null>(0.02);
  const [verticalExaggerationValue, setVerticalExaggerationValue] = useState<number | null>(
    30.0
  );
  const [elevationGammaValue, setElevationGammaValue] = useState<number | null>(1.5);
  const [profiling, setProfiling] = useState(false);
  const [viewerMeta, setViewerMeta] = useState<string[] | null>(null);
  const [profileResult, setProfileResult] = useState<DemProfileResult | null>(null);
  const profileHoverHandlerRef = useRef<(ratio: number | null) => void>(() => {});
  const [profileResetKey, setProfileResetKey] = useState(0);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const selectDem = useCallback((item: DemItem) => {
    setSelectedDemId(item.dem_id);
  }, []);

  const applyDemItems = useCallback((items: DemItem[]) => {
    setDemItems(items);
    setSelectedDemId((prev) => {
      if (!items.length) return null;
      if (prev && items.some((item) => item.dem_id === prev)) return prev;
      return items[0].dem_id;
    });
  }, []);

  const fetchDemList = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiGet<DemListApiResponse[]>("/api/v1/dem/list?limit=100&offset=0");
      const nextItems: DemItem[] = (data || []).map((item) => ({
        dem_id: item.dem_id,
        job_id: item.job_id ?? null,
        file_name: item.file_name,
        file_path: item.file_path,
        file_url: item.file_url,
        file_size: item.file_size,
        terrain_download_url: item.terrain_download_url ?? null,
        terrain_tileset_url: item.terrain_tileset_url ?? null,
        created_at: item.created_at,
        status: item.terrain_status || "READY",
        terrain_status: item.terrain_status || "READY",
      }));
      applyDemItems(nextItems);
    } catch (error) {
      message.error(parseErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [applyDemItems]);

  useEffect(() => {
    void fetchDemList();
  }, [fetchDemList]);

  const selectedDem = useMemo(
    () => demItems.find((item) => item.dem_id === selectedDemId) ?? null,
    [demItems, selectedDemId]
  );

  const selectedViewerSource = useMemo(() => {
    if (!selectedDem) return null;

    const localSource = viewerSources[selectedDem.dem_id];
    if (localSource) {
      return localSource;
    }

    const sourceUrl = (selectedDem.file_url || selectedDem.file_path || "").trim();
    if (
      sourceUrl.startsWith("http://") ||
      sourceUrl.startsWith("https://") ||
      sourceUrl.startsWith("/assets/")
    ) {
      return { mode: "url", url: sourceUrl } satisfies DemViewerSource;
    }

    return null;
  }, [selectedDem, viewerSources]);

  useEffect(() => {
    viewerSourcesRef.current = viewerSources;
  }, [viewerSources]);

  useEffect(() => {
    return () => {
      Object.values(viewerSourcesRef.current).forEach((source) => {
        if (source.mode === "file") {
          URL.revokeObjectURL(source.object_url);
        }
      });
    };
  }, []);

  useEffect(() => {
    setProfileResult(null);
    setProfileResetKey((prev) => prev + 1);
    profileHoverHandlerRef.current(null);
  }, [selectedDemId]);

  const resetProfile = useCallback(() => {
    setProfileResult(null);
    setProfileResetKey((prev) => prev + 1);
    profileHoverHandlerRef.current(null);
  }, []);

  useEffect(() => {
    if (!profiling) return;
    const media = window.matchMedia("(max-width: 900px)");
    const syncCollapsed = () => {
      if (media.matches) {
        setSidebarCollapsed(true);
      }
    };
    syncCollapsed();
    media.addEventListener("change", syncCollapsed);
    return () => {
      media.removeEventListener("change", syncCollapsed);
    };
  }, [profiling]);

  const handleRefresh = useCallback(async () => {
    await fetchDemList();
  }, [fetchDemList]);

  const handleUploadSubmit = async (payload: DemUploadSubmitPayload) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", payload.file);

      const response = await apiPost<DemUploadApiResponse>("/api/v1/dem/upload", formData);
      const demId = (response.dem_id || "").trim() || `dem-${Date.now()}`;

      const nextItem: DemItem = {
        dem_id: demId,
        job_id: null,
        file_name: response.file_name,
        file_path: response.file_path,
        file_url: response.file_url,
        file_size: response.file_size,
        terrain_download_url: null,
        terrain_tileset_url: null,
        created_at: response.created_at,
        status: "READY",
        terrain_status: "READY",
      };

      setDemItems((prev) => upsertDemItem(prev, nextItem));
      setSelectedDemId(demId);
      setViewerSources((prev) => {
        const oldSource = prev[demId];
        if (oldSource?.mode === "file") {
          URL.revokeObjectURL(oldSource.object_url);
        }

        return {
          ...prev,
          [demId]: toViewerFileSource(payload.file),
        };
      });

      setUploadModalOpen(false);
      message.success("DEM 업로드를 완료했습니다.");
    } catch (error) {
      message.error(parseErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const handleConvertItem = async (item: DemItem) => {
    setSelectedDemId(item.dem_id);
    if (converting) {
      message.warning("다른 DEM 변환이 진행 중입니다.");
      return;
    }
    setConverting(true);
    try {
      const response = await apiPost<DemConvertApiResponse>(`/api/v1/dem/${item.dem_id}/convert`, {});
      setDemItems((prev) =>
        prev.map((current) =>
          current.dem_id === item.dem_id
            ? {
                ...current,
                job_id: response.job_id,
                status: response.status,
                terrain_status: response.status,
              }
            : current
        )
      );
      message.success("Terrain 변환 작업이 시작되었습니다.");
      await fetchDemList();
    } catch (error) {
      message.error(parseErrorMessage(error));
    } finally {
      setConverting(false);
    }
  };

  const handleDownloadTerrainItem = async (item: DemItem) => {
    setSelectedDemId(item.dem_id);

    const downloadUrl = (item.terrain_download_url || "").trim();
    if (!downloadUrl) {
      message.warning("Terrain 다운로드 URL이 없습니다.");
      return;
    }

    setDownloading(true);
    try {
      const fallbackName = `${item.file_name || item.dem_id}-terrain.zip`;
      await downloadFromUrl(downloadUrl, fallbackName);
    } catch (error) {
      message.error(parseErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadTifItem = async (item: DemItem) => {
    setSelectedDemId(item.dem_id);

    const sourceUrl = (item.file_url || "").trim();
    if (!sourceUrl) {
      message.warning("다운로드 가능한 TIF URL이 없습니다.");
      return;
    }

    setDownloading(true);
    try {
      await downloadFromUrl(sourceUrl, item.file_name || `${item.dem_id}.tif`);
    } catch (error) {
      message.error(parseErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const handleMetaChange = useCallback((meta: string[] | null) => {
    setViewerMeta(meta);
  }, []);

  const handleProfileHoverHandlerReady = useCallback(
    (handler: (ratio: number | null) => void) => {
      profileHoverHandlerRef.current = handler;
    },
    []
  );

  const handleProfileHoverRatioChange = useCallback((ratio: number | null) => {
    profileHoverHandlerRef.current(ratio);
  }, []);

  const openGridSettingModal = useCallback(() => {
    setGridSettingValue(maxGridSize);
    setHeightScaleValue(heightScale);
    setVerticalExaggerationValue(verticalExaggeration);
    setElevationGammaValue(elevationGamma);
    setGridSettingOpen(true);
  }, [maxGridSize, heightScale, verticalExaggeration, elevationGamma]);

  const applyGridSetting = useCallback(() => {
    const nextGridSize = Math.max(64, Math.floor(gridSettingValue ?? maxGridSize));
    const nextHeightScale = Math.max(0.0001, Number(heightScaleValue ?? heightScale));
    const nextVerticalExaggeration = Math.max(
      0.01,
      Number(verticalExaggerationValue ?? verticalExaggeration)
    );
    const nextElevationGamma = Math.max(
      0.01,
      Number(elevationGammaValue ?? elevationGamma)
    );

    setMaxGridSize(nextGridSize);
    setHeightScale(nextHeightScale);
    setVerticalExaggeration(nextVerticalExaggeration);
    setElevationGamma(nextElevationGamma);
    setGridSettingOpen(false);
    message.success("Viewer settings applied.");
  }, [
    gridSettingValue,
    maxGridSize,
    heightScaleValue,
    heightScale,
    verticalExaggerationValue,
    verticalExaggeration,
    elevationGammaValue,
    elevationGamma,
  ]);

  return (
    <div className="dem-page-full">
      <div className="dem-layout">
        <DemSidebar
          items={demItems}
          selectedDemId={selectedDemId}
          collapsed={sidebarCollapsed}
          refreshing={refreshing}
          converting={converting}
          downloading={downloading}
          rotating={autoRotate}
          profiling={profiling}
          viewerMeta={viewerMeta}
          onSelect={selectDem}
          onRefresh={handleRefresh}
          onOpenUpload={() => setUploadModalOpen(true)}
          onToggleRotate={() => setAutoRotate((prev) => !prev)}
          onToggleProfiling={() => setProfiling((prev) => !prev)}
          onConvertItem={handleConvertItem}
          onDownloadTerrainItem={handleDownloadTerrainItem}
          onDownloadTifItem={handleDownloadTifItem}
          onOpenGridSettings={openGridSettingModal}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        <div className="dem-main">
          <div className="dem-main-viewport">
            <DemViewport
              seedKey={selectedDem?.dem_id || null}
              source={selectedViewerSource}
              autoRotate={autoRotate}
              maxGridSize={maxGridSize}
              heightScale={heightScale}
              verticalExaggeration={verticalExaggeration}
              elevationGamma={elevationGamma}
              profileEnabled={profiling}
              profileResetKey={profileResetKey}
              onMetaChange={handleMetaChange}
              onProfileChange={setProfileResult}
              onProfileHoverHandlerReady={handleProfileHoverHandlerReady}
            />
          </div>

          {profiling || profileResult ? (
            <div className="dem-main-profile">
              <DemProfilePanel
                enabled={profiling}
                profile={profileResult}
                onClose={() => {
                  setProfiling(false);
                  resetProfile();
                }}
                onClear={resetProfile}
                onHoverRatioChange={handleProfileHoverRatioChange}
              />
            </div>
          ) : null}
        </div>
      </div>
      <DemUploadModal
        open={uploadModalOpen}
        submitting={uploading}
        onCancel={() => setUploadModalOpen(false)}
        onSubmit={handleUploadSubmit}
      />
      <Modal
        className="dem-settings-modal"
        title="DEM 뷰어 설정"
        open={gridSettingOpen}
        onCancel={() => setGridSettingOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setGridSettingOpen(false)}>
            취소
          </Button>,
          <Button key="apply" type="primary" onClick={applyGridSetting}>
            적용
          </Button>,
        ]}
      >
        <Space direction="vertical" size={12} className="dem-settings-panel">
          <div className="dem-setting-item">
            <div className="dem-setting-head">
              <span className="dem-setting-name">DEM mesh resolution</span>
              <Tooltip title="지형 메시의 가로/세로 샘플 최대 크기입니다. 값이 클수록 선명하지만 무거워집니다.">
                <ExclamationCircleOutlined className="dem-setting-help" />
              </Tooltip>
            </div>
            <InputNumber
              min={64}
              max={4096}
              step={64}
              value={gridSettingValue}
              onChange={(value) => setGridSettingValue(value)}
              className="dem-setting-input"
            />
            <div className="dem-setting-desc">권장값: 512 ~ 1536</div>
          </div>

          <div className="dem-setting-item">
            <div className="dem-setting-head">
              <span className="dem-setting-name">heightScale</span>
              <Tooltip title="고도값을 실제 높이로 변환하는 기본 배율입니다.">
                <ExclamationCircleOutlined className="dem-setting-help" />
              </Tooltip>
            </div>
            <InputNumber
              min={0.0001}
              max={1}
              step={0.001}
              value={heightScaleValue}
              onChange={(value) => setHeightScaleValue(value)}
              className="dem-setting-input"
            />
            <div className="dem-setting-desc">작게: 평탄, 크게: 전체 높이 증가</div>
          </div>

          <div className="dem-setting-item">
            <div className="dem-setting-head">
              <span className="dem-setting-name">verticalExaggeration</span>
              <Tooltip title="세로 과장 배율입니다. 값이 커질수록 높낮이 대비가 강조됩니다.">
                <ExclamationCircleOutlined className="dem-setting-help" />
              </Tooltip>
            </div>
            <InputNumber
              min={0.01}
              max={200}
              step={0.5}
              value={verticalExaggerationValue}
              onChange={(value) => setVerticalExaggerationValue(value)}
              className="dem-setting-input"
            />
            <div className="dem-setting-desc">권장값: 10 ~ 60</div>
          </div>

          <div className="dem-setting-item">
            <div className="dem-setting-head">
              <span className="dem-setting-name">elevationGamma</span>
              <Tooltip title="고도 분포 곡률입니다. 1보다 크면 고지대가 더 강조됩니다.">
                <ExclamationCircleOutlined className="dem-setting-help" />
              </Tooltip>
            </div>
            <InputNumber
              min={0.01}
              max={5}
              step={0.05}
              value={elevationGammaValue}
              onChange={(value) => setElevationGammaValue(value)}
              className="dem-setting-input"
            />
            <div className="dem-setting-desc">권장값: 1.0 ~ 2.0</div>
          </div>
        </Space>
      </Modal>
    </div>
  );
}


