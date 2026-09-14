import { useCallback, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Alert, Button, Empty, Flex, Spin, Table, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined, InfoCircleOutlined, SearchOutlined } from "@ant-design/icons";

import type { ModelTypeConfig } from "../../../../config/modelTypes";
import { apiDownload } from "../../../../tools/api";
import { StatusTag } from "./statusTag";
import { ConvertJobModal } from "./conversion/ConvertJobModal";
import { TileJobDetailModal } from "./conversion/TileJobDetailModal";
import { TileViewerModal } from "./conversion/TileViewerModal";
import { PAGE_SIZE } from "./conversion/types";
import type { IfcTileRow, TileRow } from "./conversion/types";
import { useTileJobs } from "./conversion/useTileJobs";

type TileColumn = ColumnsType<TileRow>[number];

type ProjectConversionTabProps = {
  projectId: string;
  modelType: ModelTypeConfig;
};

export function ProjectConversionTab({ projectId, modelType }: ProjectConversionTabProps) {
  const isFbx = modelType.tiling === "fbx";
  const tileApiBase = modelType.tileApiBase;

  const { rows, loading, error, page, setPage, total, prepend } = useTileJobs(
    projectId,
    modelType
  );

  const [convertOpen, setConvertOpen] = useState(false);
  const [viewerTile, setViewerTile] = useState<TileRow | null>(null);
  const [detailTile, setDetailTile] = useState<TileRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = useCallback(
    async (event: MouseEvent<HTMLElement>, record: TileRow) => {
      event.stopPropagation();
      if (!record.jobId) return;
      setDownloadingId(record.jobId);
      try {
        await apiDownload(
          `${tileApiBase}/${projectId}/${record.jobId}/download`,
          `${record.tileName?.trim() || record.jobId}.zip`
        );
      } catch {
        message.error("다운로드에 실패했습니다.");
      } finally {
        setDownloadingId((current) => (current === record.jobId ? null : current));
      }
    },
    [projectId, tileApiBase]
  );

  const columns: ColumnsType<TileRow> = useMemo(() => {
    const classColumn = (
      title: string,
      key: string,
      pick: (row: IfcTileRow) => number | null
    ): TileColumn => ({
      title,
      key,
      responsive: ["md"],
      render: (_, record) => (record.kind === "ifc" ? pick(record) : null) ?? "-",
    });

    const downloadColumn: TileColumn = {
      title: "다운로드",
      key: "download",
      align: "center",
      render: (_, record) => (
        <Button
          size="small"
          shape="circle"
          icon={<DownloadOutlined />}
          loading={downloadingId === record.jobId}
          disabled={!record.jobId || record.status?.toUpperCase() !== "DONE"}
          onClick={(event) => handleDownload(event, record)}
          aria-label="Download tile"
        />
      ),
    };

    return [
      {
        title: "작업명",
        dataIndex: "tileName",
        key: "tile_name",
        ellipsis: true,
        render: (value) => value ?? "-",
      },
      {
        title: "상태",
        dataIndex: "status",
        key: "status",
        responsive: ["md"],
        render: (value, record) => {
          const tag = <StatusTag status={value} />;
          return record.kind === "fbx" && record.error ? (
            <Tooltip title="자세히에서 실패 로그를 볼 수 있습니다.">{tag}</Tooltip>
          ) : (
            tag
          );
        },
      },
      ...(isFbx
        ? []
        : [
            classColumn("전체", "total_classes", (row) => row.classes.total),
            classColumn("완료", "done_classes", (row) => row.classes.done),
            classColumn("실패", "failed_classes", (row) => row.classes.failed),
          ]),
      {
        title: "등록시간",
        dataIndex: "createdAt",
        key: "date",
        ellipsis: true,
        responsive: ["md"],
        render: (value) => value ?? "-",
      },
      {
        title: "보기",
        key: "view",
        align: "center",
        render: (_, record) => (
          <Button
            size="small"
            shape="circle"
            icon={<SearchOutlined />}
            disabled={!record.jobId}
            onClick={() => setViewerTile(record)}
            aria-label="View tiles"
          />
        ),
      },
      ...(isFbx ? [] : [downloadColumn]),
      {
        title: "자세히",
        key: "detail",
        align: "center",
        render: (_, record) => (
          <Button
            size="small"
            shape="circle"
            icon={<InfoCircleOutlined />}
            disabled={!record.jobId}
            onClick={() => setDetailTile(record)}
            aria-label="View details"
          />
        ),
      },
    ];
  }, [downloadingId, handleDownload, isFbx]);

  if (loading) {
    return (
      <Flex justify="center">
        <Spin />
      </Flex>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message={`Failed to load tiles: ${error}`} />;
  }

  return (
    <Flex vertical gap={12}>
      <Flex className="detail-header" justify="space-between" align="center" gap={8}>
        <Typography.Text className="models-table-title">3D Tiles 상태</Typography.Text>
        <Button type="primary" onClick={() => setConvertOpen(true)} disabled={!projectId}>
          작업 생성
        </Button>
      </Flex>

      <div className="models-table">
        {rows.length ? (
          <Table
            className="models-table-grid"
            columns={columns}
            dataSource={rows}
            rowKey={(record) => String(record.jobId ?? record.projectId)}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              onChange: setPage,
            }}
            size="middle"
            tableLayout="fixed"
          />
        ) : (
          <Empty description="No tiles yet" />
        )}
      </div>

      {/* 모달은 열릴 때만 마운트한다. 닫으면 내부 상태가 같이 사라진다. */}
      {convertOpen ? (
        <ConvertJobModal
          projectId={projectId}
          modelType={modelType}
          onClose={() => setConvertOpen(false)}
          onCreated={prepend}
        />
      ) : null}

      <TileViewerModal
        open={Boolean(viewerTile)}
        tilesetUrls={viewerTile?.tilesetUrls ?? []}
        onClose={() => setViewerTile(null)}
      />

      {detailTile ? (
        <TileJobDetailModal
          tile={detailTile}
          projectId={projectId}
          tileApiBase={tileApiBase}
          onClose={() => setDetailTile(null)}
        />
      ) : null}
    </Flex>
  );
}
