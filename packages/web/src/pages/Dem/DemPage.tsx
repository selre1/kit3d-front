import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";

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
import { apiPost } from "../../tools/api";
import "../../components/dem/dem.css";

type DemUploadApiResponse = {
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number;
  uploaded_at: string;
};

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

function formatUploadedAt(value?: string | null) {
  if (!value) return "Latest version · just now";
  return `Latest version · ${value}`;
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
  const [profiling, setProfiling] = useState(false);
  const [viewerMeta, setViewerMeta] = useState<string[] | null>(null);
  const [profileResult, setProfileResult] = useState<DemProfileResult | null>(null);
  const profileHoverHandlerRef = useRef<(ratio: number | null) => void>(() => {});
  const [profileResetKey, setProfileResetKey] = useState(0);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshing(false);
  };

  const handleUploadSubmit = async (payload: DemUploadSubmitPayload) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", payload.file);

      const response = await apiPost<DemUploadApiResponse>("/api/v1/dem/upload", formData);
      const now = Date.now();
      const demId = `dem-${now}`;

      const nextItem: DemItem = {
        dem_id: demId,
        file_name: response.file_name,
        file_path: response.file_path,
        file_url: response.file_url,
        file_size: response.file_size,
        uploaded_at: formatUploadedAt(response.uploaded_at),
        status: "UPLOADED",
        terrain_status: "UPLOADED",
      };

      setDemItems((prev) => [nextItem, ...prev]);
      setSelectedDemId(nextItem.dem_id);
      setViewerSources((prev) => {
        const oldSource = prev[nextItem.dem_id];
        if (oldSource?.mode === "file") {
          URL.revokeObjectURL(oldSource.object_url);
        }

        return {
          ...prev,
          [nextItem.dem_id]: {
            mode: "file",
            file: payload.file,
            object_url: URL.createObjectURL(payload.file),
          },
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
    message.info("Terrain 변환 API 연동 전입니다.");
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

  return (
    <div className="dem-page-full">
      <div className="dem-stage">
        <DemViewport
          seedKey={selectedDem?.dem_id || null}
          source={selectedViewerSource}
          autoRotate={autoRotate}
          profileEnabled={profiling}
          profileResetKey={profileResetKey}
          onMetaChange={handleMetaChange}
          onProfileChange={setProfileResult}
          onProfileHoverHandlerReady={handleProfileHoverHandlerReady}
        />
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
          onSelect={(item) => setSelectedDemId(item.dem_id)}
          onRefresh={handleRefresh}
          onOpenUpload={() => setUploadModalOpen(true)}
          onToggleRotate={() => setAutoRotate((prev) => !prev)}
          onToggleProfiling={() => setProfiling((prev) => !prev)}
          onConvertItem={handleConvertItem}
          onDownloadTerrainItem={handleDownloadTerrainItem}
          onDownloadTifItem={handleDownloadTifItem}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
        {profiling || profileResult ? (
          <DemProfilePanel
            enabled={profiling}
            profile={profileResult}
            onClear={() => {
              setProfileResult(null);
              setProfileResetKey((prev) => prev + 1);
              profileHoverHandlerRef.current(null);
            }}
            onHoverRatioChange={handleProfileHoverRatioChange}
          />
        ) : null}
      </div>

      <DemUploadModal
        open={uploadModalOpen}
        submitting={uploading}
        onCancel={() => setUploadModalOpen(false)}
        onSubmit={handleUploadSubmit}
      />
    </div>
  );
}
