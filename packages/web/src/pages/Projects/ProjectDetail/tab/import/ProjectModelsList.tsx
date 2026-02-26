import { useEffect, useMemo, useState } from "react";
import type { ReactNode, MouseEvent } from "react";
import {
  Avatar,
  Button,
  Descriptions,
  Empty,
  Flex,
  message,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileMarkdownOutlined,
  CloudDownloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";

import { apiGet } from "../../../../../tools/api";
import { IfcViewer } from "../../../../../components/ifc/IfcViewer";
import type { ImportJobItem } from "../../../../../types/project";
import { formatBytes, formatDuration, parseDate } from "../../../../../utils/format";

function statusTagProps(status?: string | null) {
  const normalized = status?.toUpperCase();
  switch (normalized) {
    case "DONE":
      return { color: "success", icon: <CheckCircleOutlined /> };
    case "RUNNING":
      return { color: "processing", icon: <SyncOutlined spin /> };
    case "FAILED":
      return { color: "error", icon: <CloseCircleOutlined /> };
    case "PENDING":
      return { color: "warning", icon: <ExclamationCircleOutlined /> };
    default:
      return { color: "default", icon: <ClockCircleOutlined /> };
  }
}

type ProjectModelsListProps = {
  projectId: string;
  refreshKey?: number;
  onRestartImport?: (item: ImportJobItem) => void;
  headerAction?: ReactNode;
};

export function ProjectModelsList({
  projectId,
  refreshKey = 0,
  onRestartImport,
  headerAction,
}: ProjectModelsListProps) {
  const [items, setItems] = useState<ImportJobItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ImportJobItem | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const pageSize = 11;
  const pageOffset = (page - 1) * pageSize;

  useEffect(() => {
    setPage(1);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const offset = (page - 1) * pageSize;
    const requestLimit = pageSize + 1;
    apiGet<ImportJobItem[]>(
      `/api/v1/import/${projectId}/list?limit=${requestLimit}&offset=${offset}`
    )
      .then((data) => {
        if (!active) return;
        const hasMore = data.length > pageSize;
        const sliced = data.slice(0, pageSize);
        const sorted = [...sliced].sort(
          (a, b) => parseDate(b.uploaded_at) - parseDate(a.uploaded_at)
        );
        setItems(sorted);
        setSelected(sorted[0] ?? null);
        setHasNext(hasMore);
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, page, refreshKey]);

  const handleDownload = async (event: MouseEvent<HTMLElement>, record: ImportJobItem) => {
    event.stopPropagation();
    if (!record?.file_id) return;
    if (downloadingId === record.file_id) return;
    setDownloadingId(record.file_id);
    try {
      const response = await fetch(`/api/v1/import/${projectId}/${record.file_id}/download`);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      const blob = await response.blob();
      const filename = record.file_name || "download.ifc";
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      message.error("다운로드에 실패했습니다.");
    } finally {
      setDownloadingId((current) => (current === record.file_id ? null : current));
    }
  };

  const columns: ColumnsType<ImportJobItem> = useMemo(
    () => [
      // {
      //   title: "파일 ID",
      //   dataIndex: "file_id",
      //   key: "id",
      //   width: 80,
      //   responsive: ["md"],
      // },
      {
        title: "파일명",
        dataIndex: "file_name",
        key: "name",
        ellipsis: true,
        render: (value) => (
          <div className="models-name">
            <Avatar shape="square" size="small" icon={<FileMarkdownOutlined />} />
            <span>{value}</span>
          </div>
        ),
      },
      {
        title: "등록시간",
        dataIndex: "uploaded_at",
        key: "date",
        ellipsis: true,
        responsive: ["sm"],
      },
      {
        title: "작업상태",
        dataIndex: "status",
        key: "status",
        render: (value) => {
          const props = statusTagProps(value);
          return (
            <Tag color={props.color} icon={props.icon} variant="solid">
              {value || "PENDING"}
            </Tag>
          );
        },
      },
      {
        title: "용량",
        dataIndex: "file_size",
        key: "size",
        responsive: ["md"],
        render: (value) => formatBytes(value),
      },
      {
        title: "다운로드",
        dataIndex: "file_id",
        key: "download",
        align: "center",
        responsive: ["sm"],
        render: (_, record) => (
          <Button
            size="small"
            shape="circle"
            icon={<CloudDownloadOutlined />}
            loading={downloadingId === record.file_id}
            disabled={!record.file_id || record.status?.toUpperCase() !== "DONE"}
            onClick={(event) => handleDownload(event, record)}
            aria-label="Download original"
          />
        ),
      },
    ],
    [items.length, pageOffset, downloadingId, projectId]
  );

  const detail = useMemo(() => {
    if (!selected) return null;
    const durationText =
      selected.status?.toUpperCase() === "DONE"
        ? formatDuration(selected.started_at, selected.finished_at)
        : "";
    return (
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="작업 종류">{selected.job_type}</Descriptions.Item>
        <Descriptions.Item label="파일 포맷">
          {(selected.file_format || "IFC").toUpperCase()}
        </Descriptions.Item>
        <Descriptions.Item label="작업 시작 시간">{selected.started_at || ""}</Descriptions.Item>
        <Descriptions.Item label="작업 종료 시간">{selected.finished_at || ""}</Descriptions.Item>
        {durationText ? (
          <Descriptions.Item label="작업 경과 시간">{durationText}</Descriptions.Item>
        ) : null}
      </Descriptions>
    );
  }, [selected]);

  const canRestart = selected?.status?.toUpperCase() === "FAILED";

  const handleRestart = () => {
    if (!selected) return;
    onRestartImport?.(selected);
  };

  if (loading) {
    return (
      <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return <div style={{ color: "#ff8a8a" }}>Failed to load models: {error}</div>;
  }

  return (
    <div className="models-layout">
      <Flex vertical gap={8} className="models-table-section">
        <Flex
          className="models-table-header"
          align="center"
          justify="space-between"
          gap={12}
        >
          <Typography.Text className="models-table-title">
            {"모델 상태"}
          </Typography.Text>
          {headerAction}
        </Flex>
        <div className="models-table">
          <Table
            className="models-table-grid"
            columns={columns}
            dataSource={items}
            rowKey={(record) => String(record.file_id)}
            pagination={{
              current: page,
              pageSize,
              total: (page - 1) * pageSize + items.length + (hasNext ? 1 : 0),
              showSizeChanger: false,
              onChange: (next) => setPage(next),
            }}
            size="middle"
            tableLayout="fixed"
            scroll={{ x: "max-content" }}
            onRow={(record) => ({
              onClick: () => setSelected(record),
            })}
            rowClassName={(record) =>
              selected?.file_id === record.file_id ? "is-active" : ""
            }
          />
        </div>
      </Flex>
      <div className="models-detail">
        <div className="models-detail-title">{"상세 정보"}</div>
        <Flex vertical gap={12} className="models-detail-body">
          <div className="models-detail-viewer">
            <IfcViewer fileUrl={selected?.file_url ?? null} />
          </div>
          <div className="models-detail-info">
            {detail}
            {canRestart ? (
              <div className="models-detail-actions">
                <Button type="primary" danger onClick={handleRestart}>
                  {"재시작"}
                </Button>
              </div>
            ) : null}
          </div>
        </Flex>
      </div>
    </div>
  );
}
