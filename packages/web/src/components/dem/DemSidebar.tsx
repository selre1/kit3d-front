import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import {
  RiDownloadLine,
  RiFileLine,
  RiMoreLine,
  RiPlayCircleLine,
  RiRefreshLine,
  RiSettings3Line,
  RiUploadCloud2Line,
} from "react-icons/ri";
import { Md3dRotation, MdMenu, MdOutlineAddPhotoAlternate } from "react-icons/md";
import { TbChartLine } from "react-icons/tb";
import { Button, Dropdown, Empty, Badge, Tooltip } from "antd";
import type { MenuProps } from "antd";

import type { DemItem } from "./types";

type DemSidebarProps = {
  items: DemItem[];
  selectedDemId: string | null;
  collapsed: boolean;
  refreshing: boolean;
  converting: boolean;
  downloading: boolean;
  rotating: boolean;
  profiling: boolean;
  viewerMeta: string[] | null;
  onSelect: (item: DemItem) => void;
  onRefresh: () => void;
  onOpenUpload: () => void;
  onToggleRotate: () => void;
  onToggleProfiling: () => void;
  onConvertItem: (item: DemItem) => void;
  onDownloadTerrainItem: (item: DemItem) => void;
  onDownloadTifItem: (item: DemItem) => void;
  onOpenGridSettings: () => void;
  onToggleCollapse: () => void;
};

type StatusBadge = {
  status: "default" | "processing" | "success" | "error" | "warning";
  text: string;
};

function statusMeta(status?: string | null): StatusBadge {
  const normalized = (status || "").toUpperCase();
  if (normalized === "READY" || !normalized) {
    return { status: "default", text: "변환 준비완료" };
  }
  if (normalized === "DONE" || normalized === "COMPLETED") {
    return { status: "success", text: "변환 완료" };
  }
  if (normalized === "PENDING") {
    return { status: "processing", text: "변환 대기열" };
  }
  
  if (normalized === "RUNNING" || normalized === "PROCESSING") {
    return { status: "processing", text: "변환 중" };
  }

  if (normalized === "ZIPPING") {
    return { status: "warning", text: "압축 중" };
  }

  if (normalized === "FAILED" || normalized === "ERROR") {
    return { status: "error", text: "변환 실패" };
  }
  return { status: "default", text: normalized };
}

function formatFileSize(bytes?: number | null) {
  if (!Number.isFinite(bytes) || (bytes ?? 0) < 0) {
    return "파일 크기 없음";
  }

  const safeBytes = bytes as number;
  if (safeBytes < 1024) return `${safeBytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = safeBytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatCreatedAt(createdAt?: string | null) {
  const text = (createdAt || "").trim();
  if (!text) {
    return "생성일 없음";
  }
  return text;
}

export function DemSidebar({
  items,
  selectedDemId,
  collapsed,
  refreshing,
  converting,
  downloading,
  rotating,
  profiling,
  viewerMeta,
  onSelect,
  onRefresh,
  onOpenUpload,
  onToggleRotate,
  onToggleProfiling,
  onConvertItem,
  onDownloadTerrainItem,
  onDownloadTifItem,
  onOpenGridSettings,
  onToggleCollapse,
}: DemSidebarProps) {
  const getTooltipContainer = (trigger: HTMLElement) =>
    (trigger.closest(".dem-sidebar-actions") as HTMLElement) ?? trigger;

  const selectedItem = useMemo(
    () => items.find((item) => item.dem_id === selectedDemId) ?? null,
    [items, selectedDemId]
  );

  const viewerMetaItems = useMemo(() => {
    if (!viewerMeta) return [];
    return viewerMeta.map((item) => item.trim()).filter(Boolean);
  }, [viewerMeta]);

  const buildItemMenu = (item: DemItem): MenuProps => {
    const normalizedTerrainStatus = (item.terrain_status || "").toUpperCase();
    const hasTerrainDownloadUrl = Boolean((item.terrain_download_url || "").trim());
    const isTerrainFinished =
      normalizedTerrainStatus === "DONE" || normalizedTerrainStatus === "COMPLETED";
    const isTerrainReady = isTerrainFinished && hasTerrainDownloadUrl;
    const isTerrainInProgress =
      normalizedTerrainStatus === "PENDING" ||
      normalizedTerrainStatus === "RUNNING" ||
      normalizedTerrainStatus === "ZIPPING";

    return {
      items: [
        {
          key: "convert",
          icon: <RiPlayCircleLine />,
          label: "Terrain 변환",
          disabled: converting || isTerrainInProgress || isTerrainFinished,
        },
        {
          key: "download-terrain",
          icon: <RiDownloadLine />,
          label: "Terrain 다운로드",
          disabled: !isTerrainReady || downloading,
        },
        {
          type: "divider",
        },
        {
          key: "download-tif",
          icon: <RiFileLine />,
          label: "TIF 다운로드",
          disabled: downloading,
        },
      ],
      onClick: ({ key, domEvent }) => {
        domEvent.stopPropagation();
        if (key === "convert") {
          onConvertItem(item);
          return;
        }
        if (key === "download-terrain") {
          onDownloadTerrainItem(item);
          return;
        }
        if (key === "download-tif") {
          onDownloadTifItem(item);
        }
      },
    };
  };

  const onItemKeyDown = (event: KeyboardEvent<HTMLDivElement>, item: DemItem) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(item);
    }
  };

  return (
    <aside className={`dem-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <button
        type="button"
        className="dem-sidebar-toggle-handle"
        onClick={onToggleCollapse}
        aria-label="목록 토글"
      >
        <MdMenu />
      </button>

      <div className="dem-sidebar-header">
        <div className="dem-sidebar-headline">
          <div className="dem-sidebar-title">지형 모델 목록</div>
          <div className="dem-sidebar-subtitle">{`${items.length}개`}</div>
        </div>

        <div className="dem-sidebar-actions">
          <Tooltip
            title="설정"
            placement="top"
            overlayClassName="dem-action-tooltip"
            getPopupContainer={getTooltipContainer}
          >
            <Button
              size="small"
              type="text"
              icon={<RiSettings3Line />}
              onClick={onOpenGridSettings}
              aria-label="설정 열기"
            />
          </Tooltip>
          <Tooltip
            title="새로고침"
            placement="top"
            overlayClassName="dem-action-tooltip"
            getPopupContainer={getTooltipContainer}
          >
            <Button
              size="small"
              type="text"
              icon={<RiRefreshLine />}
              loading={refreshing}
              onClick={onRefresh}
              aria-label="새로고침"
            />
          </Tooltip>
          <Tooltip
            title={
              rotating
                ? "회전 멈추기"
                : "회전 시작"
            }
            placement="top"
            overlayClassName="dem-action-tooltip"
            getPopupContainer={getTooltipContainer}
          >
            <Button
              size="small"
              type="text"
              className={`dem-rotate-btn ${rotating ? "is-active" : ""}`}
              icon={<Md3dRotation className={rotating ? "ri-spin" : undefined} />}
              onClick={onToggleRotate}
              aria-label={
                rotating
                  ? "회전 멈추기"
                  : "회전 시작"
              }
            />
          </Tooltip>
          <Tooltip
            title={
              profiling
                ? "프로파일 분석 종료"
                : "프로파일 분석 시작"
            }
            placement="top"
            overlayClassName="dem-action-tooltip"
            getPopupContainer={getTooltipContainer}
          >
            <Button
              size="small"
              type="text"
              className={`dem-profile-btn ${profiling ? "is-active" : ""}`}
              icon={<TbChartLine />}
              onClick={onToggleProfiling}
              aria-label={
                profiling
                  ? "프로파일 분석 종료"
                  : "프로파일 분석 시작"
              }
            />
          </Tooltip>
          <Tooltip
            title="DEM 업로드"
            placement="top"
            overlayClassName="dem-action-tooltip"
            getPopupContainer={getTooltipContainer}
          >
            <Button
              size="small"
              type="text"
              icon={<MdOutlineAddPhotoAlternate />}
              onClick={onOpenUpload}
              aria-label="DEM 업로드"
            />
          </Tooltip>
        </div>
      </div>

      <div className="dem-sidebar-body">
        {items.length ? (
          collapsed ? (
            <div className="dem-list-compact">
              {items.map((item) => {
                const isActive = item.dem_id === selectedDemId;
                return (
                  <button
                    key={item.dem_id}
                    type="button"
                    className={`dem-list-compact-item ${isActive ? "is-active" : ""}`}
                    onClick={() => onSelect(item)}
                  >
                    <RiUploadCloud2Line />
                  </button>
                );
              })}
            </div>
          ) : (
            items.map((item) => {
              const isActive = item.dem_id === selectedDemId;
              const status = statusMeta(item.terrain_status || item.status);

              return (
                <div
                  key={item.dem_id}
                  className={`dem-list-item ${isActive ? "is-active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(item)}
                  onKeyDown={(event) => onItemKeyDown(event, item)}
                >
                  <div className="dem-list-icon">
                    <RiUploadCloud2Line />
                  </div>

                  <div className="dem-list-main">
                    <div className="dem-list-head">
                      <div className="dem-list-name">{item.file_name || item.dem_id}</div>
                      <Dropdown
                        menu={buildItemMenu(item)}
                        trigger={["click"]}
                        placement="bottomLeft"
                        overlayClassName="dem-item-dropdown"
                      >
                        <Button
                          type="text"
                          size="small"
                          className="dem-list-more"
                          icon={<RiMoreLine />}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                        />
                      </Dropdown>
                    </div>

                    <div className="dem-list-meta">
                      {`${formatCreatedAt(item.created_at)} · ${formatFileSize(item.file_size)}`}
                    </div>
                    <Badge status={status.status} text={status.text} />
                  </div>
                </div>
              );
            })
          )
        ) : (
          <div className="dem-list-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="DEM이 없습니다."
            />
          </div>
        )}
      </div>

      {!collapsed && selectedItem ? (
        <div className="dem-sidebar-tree">
          <div className="dem-tree-title">{selectedItem.file_name || selectedItem.dem_id}</div>
          <ul>
            {viewerMetaItems.length ? (
              viewerMetaItems.map((item, index) => <li key={`meta-${index}`}>{item}</li>)
            ) : (
              <li>메타 정보 없음</li>
            )}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
