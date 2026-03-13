import { useEffect, useMemo, useState } from "react";
import { message } from "antd";

import {
  DemSidebar,
  DemThreeViewport,
  DemUploadModal,
} from "../../components/dem";
import type { DemItem, DemUploadSubmitPayload } from "../../components/dem";
import "../../components/dem/dem.css";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createDummyDemList(): DemItem[] {
  return [
    {
      dem_id: "dem-20260312-001",
      job_id: "job-dem-20260312-001",
      file_name: "origin_s16_dem.tif",
      file_path: "/data/assets/terrain/job-dem-20260312-001/dem/origin_s16_dem.tif",
      file_size: 182_332_118,
      uploaded_at: "Latest version · 1 day ago",
      status: "UPLOADED",
      terrain_status: "COMPLETED",
    },
    {
      dem_id: "dem-20260312-002",
      job_id: "job-dem-20260312-002",
      file_name: "seoul_hill_dem.tif",
      file_path: "/data/assets/terrain/job-dem-20260312-002/dem/seoul_hill_dem.tif",
      file_size: 96_025_441,
      uploaded_at: "Latest version · 4 hours ago",
      status: "UPLOADED",
      terrain_status: "UPLOADED",
    },
  ];
}

function createItemFromPayload(payload: DemUploadSubmitPayload): DemItem {
  const now = Date.now();
  const demId = `dem-${now}`;
  const jobId = `job-dem-${now}`;

  if (payload.mode === "file") {
    return {
      dem_id: demId,
      job_id: jobId,
      file_name: payload.file.name,
      file_path: `/data/assets/terrain/${jobId}/dem/${payload.file.name}`,
      file_size: payload.file.size,
      uploaded_at: "Latest version · just now",
      status: "UPLOADED",
      terrain_status: "UPLOADED",
    };
  }

  const fromUrl = payload.url.split("/").filter(Boolean).pop() || `remote-${demId}.tif`;
  return {
    dem_id: demId,
    job_id: jobId,
    file_name: fromUrl,
    file_path: payload.url,
    file_size: null,
    uploaded_at: "Latest version · just now",
    status: "UPLOADED",
    terrain_status: "UPLOADED",
  };
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

export function DemPage() {
  const [demItems, setDemItems] = useState<DemItem[]>([]);
  const [selectedDemId, setSelectedDemId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selectedDem = useMemo(
    () => demItems.find((item) => item.dem_id === selectedDemId) ?? null,
    [demItems, selectedDemId]
  );

  useEffect(() => {
    const initial = createDummyDemList();
    setDemItems(initial);
    setSelectedDemId(initial[0]?.dem_id ?? null);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await wait(280);
      message.success("목록을 새로고침했습니다.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleUploadSubmit = async (payload: DemUploadSubmitPayload) => {
    setUploading(true);
    try {
      await wait(420);
      const next = createItemFromPayload(payload);
      setDemItems((prev) => [next, ...prev]);
      setSelectedDemId(next.dem_id);
      setUploadModalOpen(false);
      message.success("DEM 업로드를 완료했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleConvertItem = async (item: DemItem) => {
    if (converting) {
      message.warning("다른 DEM 변환이 진행 중입니다.");
      return;
    }

    setSelectedDemId(item.dem_id);
    setConverting(true);
    try {
      setDemItems((prev) =>
        prev.map((current) =>
          current.dem_id === item.dem_id
            ? { ...current, terrain_status: "RUNNING" }
            : current
        )
      );

      await wait(1300);

      setDemItems((prev) =>
        prev.map((current) =>
          current.dem_id === item.dem_id
            ? { ...current, terrain_status: "COMPLETED" }
            : current
        )
      );

      message.success("Terrain 변환을 완료했습니다.");
    } finally {
      setConverting(false);
    }
  };

  const handleDownloadTerrainItem = async (item: DemItem) => {
    const status = (item.terrain_status || "").toUpperCase();
    if (status !== "COMPLETED") {
      message.warning("Terrain 변환 완료 후 다운로드할 수 있습니다.");
      return;
    }

    setSelectedDemId(item.dem_id);
    setDownloading(true);
    try {
      await wait(180);
      const blob = new Blob(
        [
          JSON.stringify(
            {
              dem_id: item.dem_id,
              file_name: item.file_name,
              generated_at: new Date().toISOString(),
              mode: "dummy-terrain",
            },
            null,
            2
          ),
        ],
        { type: "application/zip" }
      );

      const fileName = `${item.file_name || item.dem_id}-terrain.zip`;
      triggerDownload(blob, fileName);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadTifItem = async (item: DemItem) => {
    setSelectedDemId(item.dem_id);
    setDownloading(true);
    try {
      await wait(120);
      const blob = new Blob(
        [
          JSON.stringify(
            {
              dem_id: item.dem_id,
              file_name: item.file_name,
              file_path: item.file_path,
              exported_at: new Date().toISOString(),
              mode: "dummy-tif",
            },
            null,
            2
          ),
        ],
        { type: "application/octet-stream" }
      );

      const fileName = item.file_name || `${item.dem_id}.tif`;
      triggerDownload(blob, fileName);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="dem-page-full">
      <div className="dem-stage">
        <DemThreeViewport seedKey={selectedDem?.dem_id || null} />
        <DemSidebar
          items={demItems}
          selectedDemId={selectedDemId}
          collapsed={sidebarCollapsed}
          refreshing={refreshing}
          converting={converting}
          downloading={downloading}
          onSelect={(item) => setSelectedDemId(item.dem_id)}
          onRefresh={handleRefresh}
          onOpenUpload={() => setUploadModalOpen(true)}
          onConvertItem={handleConvertItem}
          onDownloadTerrainItem={handleDownloadTerrainItem}
          onDownloadTifItem={handleDownloadTifItem}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
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
