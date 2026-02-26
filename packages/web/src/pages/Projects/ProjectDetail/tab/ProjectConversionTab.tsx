import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Input,
  InputNumber,
  Empty,
  Flex,
  Layout,
  Modal,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloudDownloadOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  SyncOutlined,
} from "@ant-design/icons";

import { apiGet, apiPost } from "../../../../tools/api";
import { CesiumFeatureInspector, CesiumViewer } from "../../../../components/cesium";
import type { CesiumFeatureInfo } from "../../../../components/cesium";
import { formatDuration } from "../../../../utils/format";

type TileItem = {
  tile_job_id?: string | null;
  project_id?: string | null;
  tile_name?: string | null;
  status?: string | null;
  total_classes?: number | null;
  done_classes?: number | null;
  failed_classes?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  tilesets?: {
    ifc_class?: string | null;
    tileset_url?: string | null;
    status?: string | null;
    error?: string | null;
    updated_at?: string | null;
  }[];
};

type ProjectConversionTabProps = {
  projectId: string;
};

type ImportStatusItem = {
  project_id: string;
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  other: number;
  all_done: boolean;
};

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

export function ProjectConversionTab({ projectId }: ProjectConversionTabProps) {
  const [items, setItems] = useState<TileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTile, setSelectedTile] = useState<TileItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusItems, setStatusItems] = useState<ImportStatusItem[]>([]);
  const [converting, setConverting] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<CesiumFeatureInfo | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTile, setInfoTile] = useState<TileItem | null>(null);
  const [showTilesetUrl, setShowTilesetUrl] = useState(false);
  const [showTilesetStatus, setShowTilesetStatus] = useState(false);
  const [tileName, setTileName] = useState("");
  const [maxFeaturesPerTile, setMaxFeaturesPerTile] = useState<number>(1000);
  const [geometricError, setGeometricError] = useState<number>(50);
  const pageSize = 11;
  const tilesetRequestUrl = useMemo(() => {
    if (!infoTile?.tile_job_id) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/v1/tile/${projectId}/${infoTile.tile_job_id}/tileset/urls`;
  }, [infoTile, projectId]);

  const tilesetStatusRows = useMemo(() => {
    const tilesets = infoTile?.tilesets ?? [];
    return tilesets.map((tileset, index) => ({
      key: `${tileset.ifc_class ?? "class"}-${index}`,
      ifc_class: tileset.ifc_class ?? "-",
      status: tileset.status ?? "PENDING",
    }));
  }, [infoTile]);
  
  const tilesetUrls = useMemo(() => {
    const tilesets = selectedTile?.tilesets ?? [];
    return tilesets
      .filter(
        (tileset) =>
          Boolean(tileset?.tileset_url) &&
          (tileset?.status ?? "").toUpperCase() === "DONE"
      )
      .map((tileset) => String(tileset?.tileset_url));
  }, [selectedTile]);

  useEffect(() => {
    setSelectedFeature(null);
  }, [selectedTile, detailOpen]);

  useEffect(() => {
    setPage(1);
  }, [projectId]);

  useEffect(() => {
    setShowTilesetUrl(false);
    setShowTilesetStatus(false);
  }, [infoOpen, infoTile]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setLoading(true);
    const offset = (page - 1) * pageSize;
    const requestLimit = pageSize + 1;
    apiGet<TileItem[]>(
      `/api/v1/tile/${projectId}/list?limit=${requestLimit}&offset=${offset}`
    )
      .then((data) => {
        if (!active) return;
        const normalized = data ?? [];
        const hasMore = normalized.length > pageSize;
        const sliced = normalized.slice(0, pageSize);
        setItems(sliced);
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
  }, [projectId, page]);

  const handleDownload = async (event: MouseEvent<HTMLElement>, record: TileItem) => {
    event.stopPropagation();
    if (!record?.tile_job_id) return;
    if (downloadingId === record.tile_job_id) return;
    setDownloadingId(record.tile_job_id);
    try {
      const url = `/api/v1/tile/${projectId}/${record.tile_job_id}/download`;
      const anchor = document.createElement("a");
      const filename = "tiles.zip";
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      message.error("다운로드에 실패했습니다.");
    } finally {
      setDownloadingId((current) => (current === record.tile_job_id ? null : current));
    }
  }

  const columns: ColumnsType<TileItem> = useMemo(
    () => [
      // {
      //   title: "Project",
      //   dataIndex: "project_id",
      //   key: "project_id",
      //   ellipsis: true,
      //   responsive: ["md"],
      //   render: (value) => value ?? "-",
      // },
      // {
      //   title: "작업 ID",
      //   dataIndex: "tile_job_id",
      //   key: "tile_job_id",
      //   ellipsis: true,
      //   width: 180,
      //   render: (value) => {
      //     if (!value) return "-";
      //     const text = String(value);
      //     const short =
      //       text.length > 14 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text;
      //     return (
      //       <Typography.Text
      //         style={{ display: "inline-block", maxWidth: 160 }}
      //         ellipsis={{ tooltip: text }}
      //       >
      //         {short}
      //       </Typography.Text>
      //     );
      //   },
      // }, 
      {
        title: "작업명",
        dataIndex: "tile_name",
        key: "tile_name",
        ellipsis: true,
        render: (value) => value ?? "-",
      },
      {
        title: "상태",
        dataIndex: "status",
        key: "status",
        responsive: ["md"],
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
        title: "전체",
        dataIndex: "total_classes",
        key: "total_classes",
        responsive: ["md"],
        render: (value) => value ?? "-",
      },
      {
        title: "완료",
        dataIndex: "done_classes",
        key: "done_classes",
        responsive: ["md"],
        render: (value) => value ?? "-",
      },
      {
        title: "실패",
        dataIndex: "failed_classes",
        key: "failed_classes",  
        responsive: ["md"],
        render: (value) => value ?? "-",
      },
      {
        title: "등록시간",
        dataIndex: "created_at",
        key: "date",
        ellipsis: true,
        responsive: ["md"],
        render: (_value, record) =>
          record.created_at ?? "-",
      },
      {
        title: "보기",
        key: "view",
        align: "center",
        render: (_, record) => {
          return (
            <Button
              size="small"
              shape="circle"
              icon={<SearchOutlined />}
              disabled={!record.tile_job_id}
              onClick={() => {
                setSelectedTile(record);
                setDetailOpen(true);
              }}
              aria-label="View tiles"
            />
          );
        },
      },
      {
        title: "다운로드",
        key: "download",
        align: "center",
        render: (_, record) => {
          return (
            <Button
              size="small"
              shape="circle"
              icon={<CloudDownloadOutlined />}
              loading={downloadingId === record.tile_job_id}
              disabled={!record.tile_job_id || record.status?.toUpperCase() !== "DONE"}
              onClick={(event) => handleDownload(event, record)}
              aria-label="Download tile"
            />
          );
        },
      },
      {
        title: "자세히",
        key: "detail",
        align: "center",
        render: (_, record) => {
          return (
            <Button
              size="small"
              shape="circle"
              icon={<InfoCircleOutlined />}
              disabled={!record.tile_job_id}
              onClick={() => {
                setInfoTile(record);
                setInfoOpen(true);
              }}
              aria-label="View details"
            />
          );
        },
      },
    ],
    [downloadingId, projectId]
  );
  const fetchStatus = () => {
    if (!projectId) return;
    setTileName("");
    setMaxFeaturesPerTile(1000);
    setGeometricError(50);
    setStatusOpen(true);
    setStatusLoading(true);
    setStatusError(null);
    apiGet<ImportStatusItem[] | ImportStatusItem>(`/api/v1/import/${projectId}/status`)
      .then((data) => {
        if (Array.isArray(data)) {
          setStatusItems(data);
        } else if (data) {
          setStatusItems([data]);
        } else {
          setStatusItems([]);
        }
      })
      .catch((err: Error) => {
        setStatusError(err.message);
      })
      .finally(() => {
        setStatusLoading(false);
      });
  };

  const canConvert = statusItems.some((item) => item.all_done);
  const statusSummary = statusItems.reduce(
    (acc, item) => ({
      total: acc.total + (item.total ?? 0),
      running: acc.running + (item.running ?? 0),
      done: acc.done + (item.done ?? 0),
    }),
    { total: 0, running: 0, done: 0 }
  );

  const handleConvert = () => {
    if (!projectId) return;
    setConverting(true);
    const trimmedName = tileName.trim();
    const payload: Record<string, unknown> = {
      max_features_per_tile: maxFeaturesPerTile,
      geometric_error: geometricError,
    };
    if (trimmedName) {
      payload.tile_name = trimmedName;
    }
    apiPost<TileItem>(`/api/v1/tile/${projectId}/tiling`, payload)
      .then((created) => {
        if (created) {
          setItems((prev) => [created, ...prev]);
        }
        message.success("변환 작업 요청을 하였습니다.");
        setStatusOpen(false);
        setTileName("");
      })
      .catch((err: Error) => {
        message.error(err.message || "변환 작업 요청에 실패했습니다.");
      })
      .finally(() => {
        setConverting(false);
      });
  };

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
        <Typography.Text className="models-table-title">
            {"3D Tiles 상태"}
        </Typography.Text>
        <Button type="primary" onClick={fetchStatus} disabled={!projectId}>
          작업 생성
        </Button>
      </Flex>

      <div className="models-table">
        {items.length ? (
          <Table
            className="models-table-grid"
            columns={columns}
            dataSource={items}
            rowKey={(record) => String(record.tile_job_id ?? record.project_id)}
            pagination={{
              current: page,
              pageSize,
              total: (page - 1) * pageSize + items.length + (hasNext ? 1 : 0),
              showSizeChanger: false,
              onChange: (next) => setPage(next),
            }}
            size="middle"
            tableLayout="fixed"
          />
        ) : (
          <Empty description="No tiles yet" />
        )}
      </div>

      <Modal
        title="작업 상태 분석"
        open={statusOpen}
        onCancel={() => setStatusOpen(false)}
        footer={[
          <Button key="close" onClick={() => setStatusOpen(false)}>
            닫기
          </Button>,
          canConvert ? (
            <Button key="convert" type="primary" onClick={handleConvert} loading={converting}>
              변환 실행
            </Button>
          ) : null,
        ]}
      >
        {statusLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : statusError ? (
          <Alert type="error" showIcon message={`Failed to load status: ${statusError}`} />
        ) : statusItems.length ? (
          <Flex vertical gap={12}>
            <Alert
              showIcon
              type={statusSummary.running > 0 ? "warning" : "success"}
              message="알림"
              description={
                statusSummary.running > 0
                  ? `현재 임포트 작업이 ${statusSummary.running}개 진행중입니다. \n 작업이 모두 완료된 후 변환을 시도해 주세요`
                  : statusSummary.total === statusSummary.done
                    ? '3D Tiles 변환 실행이 가능합니다.'
                    : `전체 임포트 작업 ${statusSummary.total}건중 완료된 작업은 ${statusSummary.done}개입니다. \n 완료된 작업에 대한 변환 실행이 가능합니다.`
              }
            />
            {statusSummary.running > 0 ? null : (
              <>
                <Flex vertical gap={6}>
                  <Typography.Text>작업명</Typography.Text>
                  <Input
                    value={tileName}
                    onChange={(event) => setTileName(event.target.value)}
                    placeholder="작업명을 입력하세요"
                    maxLength={120}
                  />
                </Flex>
                <Flex vertical gap={6}>
                  <Typography.Text>타일 당 최대 객체 수(max_features_per_tile)</Typography.Text>
                  <InputNumber
                    min={1}
                    step={1}
                    value={maxFeaturesPerTile}
                    onChange={(value) =>
                      setMaxFeaturesPerTile(
                        typeof value === "number" ? value : 1000
                      )
                    }
                    style={{ width: "100%" }}
                  />
                  <Typography.Text type="secondary">
                    값이 커질수록 변환 속도 감소, 용량 증가, 렌더링 성능 저하 (기본값: 1000) 
                  </Typography.Text>
                </Flex>
                <Flex vertical gap={6}>
                  <Typography.Text>상세 수준(geometric_error)</Typography.Text>
                  <InputNumber
                    min={0}
                    step={1}
                    value={geometricError}
                    onChange={(value) =>
                      setGeometricError(typeof value === "number" ? value : 50)
                    }
                    style={{ width: "100%" }}
                  />
                  <Typography.Text type="secondary">
                    값이 커질수록 덜 상세하게 보여주고 빠르게 전환 (기본값: 50)
                  </Typography.Text>
                </Flex>
              </>
              )
            }
          </Flex>
        ) : (
          <Empty description="No status available" />
        )}
      </Modal>

      <Modal
        className="conversion-modal"
        title="3D"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width="92vw"
        centered
        styles={{ body: { padding: 0 } }}
      >
        <Layout className="conversion-modal-layout">
          <Layout.Content className="conversion-viewer">
            <CesiumViewer
              tilesetUrls={tilesetUrls}
              onFeatureSelect={setSelectedFeature}
            />
          </Layout.Content>
          <Layout.Content className="conversion-tree">
            <div className="conversion-tree-header">
              <div className="conversion-tree-title">모델정보</div>
            </div>
            <div className="conversion-tree-body">

              <CesiumFeatureInspector info={selectedFeature} />
            </div>
          </Layout.Content>
        </Layout>
      </Modal>

      <Modal
        title={`${infoTile?.tile_name} 상세정보`}
        open={infoOpen}
        onCancel={() => setInfoOpen(false)}
        width="fit-content"
        footer={[
          <Button key="close" onClick={() => setInfoOpen(false)}>
            닫기
          </Button>,
        ]}
      >
        {infoTile ? (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="작업 ID">
              {infoTile.tile_job_id ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="프로젝트 ID">
              {infoTile.project_id ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="시작시간">
              {infoTile.started_at ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="종료시간">
              {infoTile.finished_at ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="경과시간">
              {formatDuration(infoTile.started_at, infoTile.finished_at, {
                includeSeconds: true,
                empty: "-",
              })}
            </Descriptions.Item>
            <Descriptions.Item label="타일셋 상태">
              <Flex vertical gap={8}>
                <Button
                  size="small"
                  onClick={() => setShowTilesetStatus((prev) => !prev)}
                  disabled={!tilesetStatusRows.length}
                >
                  {showTilesetStatus ? "목록 닫기" : "목록 보기"}
                </Button>
                {showTilesetStatus ? (
                  tilesetStatusRows.length ? (
                    <Flex wrap="wrap" gap={8}>
                      {tilesetStatusRows.map((item) => {
                        const props = statusTagProps(item.status);
                        return (
                          <Tag
                            key={item.key}
                            color={props.color}
                            icon={props.icon}
                            variant="solid"
                          >
                            {item.ifc_class}
                          </Tag>
                        );
                      })}
                    </Flex>
                  ) : (
                    <Typography.Text type="secondary">없음</Typography.Text>
                  )
                ) : null}
              </Flex>
            </Descriptions.Item>
            <Descriptions.Item label="접근 URL">
              <Flex vertical gap={8}>
                <Typography.Text type="secondary">
                  {infoTile.tilesets?.length ? `총 ${infoTile.tilesets.length}개 중 ${infoTile.tilesets.filter(t => t.status === "DONE").length}개 완료` : "없음"}
                </Typography.Text>
                <Button
                  size="small"
                  onClick={() => setShowTilesetUrl(true)}
                  disabled={!tilesetRequestUrl}
                >
                  URL 생성
                </Button>
                {showTilesetUrl ? (
                  <Typography.Text keyboard copyable style={{ marginTop: 8 }}>
                    {tilesetRequestUrl || "타일셋이 없습니다."}
                  </Typography.Text>
                ) : null}
              </Flex>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty description="No details" />
        )}
      </Modal>
    </Flex>
  );
}
