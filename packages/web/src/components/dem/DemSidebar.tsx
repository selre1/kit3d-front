import { useMemo } from "react";
import {
  RiDownloadLine,
  RiFileLine,
  RiMoreLine,
  RiPlayCircleLine,
  RiRefreshLine,
  RiUploadCloud2Line,
} from "react-icons/ri";
import { MdMenu, Md3dRotation, MdOutlineAddPhotoAlternate } from "react-icons/md";
import { TbChartLine } from "react-icons/tb";
import { Button, Dropdown, Empty, Tag } from "antd";
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
  onToggleCollapse: () => void;
};

function statusMeta(status?: string | null) {
  const normalized = (status || "UPLOADED").toUpperCase();
  if (normalized === "COMPLETED" || normalized === "DONE") {
    return { color: "success", text: "COMPLETED" };
  }
  if (normalized === "RUNNING" || normalized === "PROCESSING") {
    return { color: "processing", text: "RUNNING" };
  }
  if (normalized === "FAILED" || normalized === "ERROR") {
    return { color: "error", text: "FAILED" };
  }
  return { color: "default", text: "UPLOADED" };
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
  onToggleCollapse,
}: DemSidebarProps) {
  const selectedItem = useMemo(
    () => items.find((item) => item.dem_id === selectedDemId) ?? null,
    [items, selectedDemId]
  );
  const viewerMetaItems = useMemo(() => {
    if (!viewerMeta) return [];
    return viewerMeta.map((item) => item.trim()).filter(Boolean);
  }, [viewerMeta]);

  const buildItemMenu = (item: DemItem): MenuProps => {
    const isTerrainReady = (item.terrain_status || "").toUpperCase() === "COMPLETED";

    return {
      items: [
        {
          key: "convert",
          icon: <RiPlayCircleLine />,
          label: "Terrain 변환",
          disabled: converting,
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

  const onItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, item: DemItem) => {
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
        aria-label="목록 접기/펼치기"
      >
        <MdMenu />
      </button>

      <div className="dem-sidebar-header">
        <div className="dem-sidebar-headline">
          <div className="dem-sidebar-title">지형 모델 목록</div>
          <div className="dem-sidebar-subtitle">{items.length} 개</div>
        </div>

        <div className="dem-sidebar-actions">
          <Button
            size="small"
            type="text"
            icon={<RiRefreshLine />}
            loading={refreshing}
            onClick={onRefresh}
            aria-label="새로고침"
          />
          <Button
            size="small"
            type="text"
            className={`dem-rotate-btn ${rotating ? "is-active" : ""}`}
            icon={<Md3dRotation className={rotating ? "ri-spin" : undefined} />}
            onClick={onToggleRotate}
            aria-label={rotating ? "회전 멈춤" : "회전 시작"}
          />
          <Button
            size="small"
            type="text"
            className={`dem-profile-btn ${profiling ? "is-active" : ""}`}
            icon={<TbChartLine />}
            onClick={onToggleProfiling}
            aria-label={profiling ? "프로파일 측정 모드 종료" : "프로파일 측정 모드 시작"}
          />
          <Button
            size="small"
            type="text"
            icon={<MdOutlineAddPhotoAlternate />}
            onClick={onOpenUpload}
            aria-label="DEM 업로드"
          />
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
                        placement="bottomRight"
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

                    <div className="dem-list-meta">{item.uploaded_at || "just now"}</div>
                    <Tag color={status.color}>{status.text}</Tag>
                  </div>
                </div>
              );
            })
          )
        ) : (
          <div className="dem-list-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="DEM이 없습니다." />
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
