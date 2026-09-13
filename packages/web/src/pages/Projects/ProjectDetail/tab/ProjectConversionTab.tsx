import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ModelTypeConfig } from "../../../../config/modelTypes";
import { apiDownload, apiGet, apiPost, isApiError } from "../../../../tools/api";
import { CesiumFeatureInspector, CesiumViewer } from "../../../../components/cesium";
import type { CesiumFeatureInfo } from "../../../../components/cesium";
import type { FbxTileJob, IfcTileJob } from "../../../../types/project";
import { formatDuration } from "../../../../utils/format";

/** FBX 변환 기본값. 본문 없이 보내도 서버가 같은 값으로 돈다. */
const FBX_DEFAULTS = {
  crs: "5187",
  rotateXAxis: 90,
  splitByNode: true,
} as const;

const IFC_DEFAULTS = {
  maxFeaturesPerTile: 1000,
  geometricError: 50,
} as const;

/** 더 이상 변하지 않는 상태. 폴링을 멈출 기준이다. */
const TERMINAL_STATUSES = ["DONE", "FAILED"];

const FBX_POLL_INTERVAL_MS = 5000;

/**
 * 두 파이프라인이 공유하는 부분.
 * 목록·뷰어·페이지네이션은 여기까지만 알면 된다.
 */
type TileRowBase = {
  jobId: string | null;
  projectId: string | null;
  tileName: string | null;
  status: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** 뷰어에 물릴 타일셋 URL. 완료된 것만 담는다. */
  tilesetUrls: string[];
};

/** IFC 작업 — 타일셋이 IFC 클래스 단위로 쪼개지고, 진행도 클래스 수로 센다. */
type IfcTileRow = TileRowBase & {
  kind: "ifc";
  classes: { total: number | null; done: number | null; failed: number | null };
  tilesets: NonNullable<IfcTileJob["tilesets"]>;
};

/** FBX 작업 — 프로젝트 전체가 타일셋 한 건이고, 실패는 변환기 로그로 온다. */
type FbxTileRow = TileRowBase & {
  kind: "fbx";
  /** 변환기 원문 로그(마지막 60줄, 영문) */
  error: string | null;
  options: FbxTileJob["options"];
};

/**
 * 두 파이프라인의 작업을 한 가지 행 모델로 맞춘다.
 * 응답 스키마가 거의 겹치지 않지만 목록·뷰어·상세는 공유하고 싶어서,
 * 공통부는 합치고 고유 필드는 `kind` 로 갈라 컴파일러가 잘못된 접근을 막게 한다.
 */
type TileRow = IfcTileRow | FbxTileRow;

function normalizeIfcTileJob(raw: IfcTileJob): IfcTileRow {
  const tilesets = raw.tilesets ?? [];
  return {
    kind: "ifc",
    jobId: raw.tile_job_id ?? null,
    projectId: raw.project_id ?? null,
    tileName: raw.tile_name ?? null,
    status: raw.status ?? null,
    createdAt: raw.created_at ?? null,
    startedAt: raw.started_at ?? null,
    finishedAt: raw.finished_at ?? null,
    tilesetUrls: tilesets
      .filter(
        (tileset) =>
          Boolean(tileset?.tileset_url) && (tileset?.status ?? "").toUpperCase() === "DONE"
      )
      .map((tileset) => String(tileset.tileset_url)),
    classes: {
      total: raw.total_classes ?? null,
      done: raw.done_classes ?? null,
      failed: raw.failed_classes ?? null,
    },
    tilesets,
  };
}

function normalizeFbxTileJob(raw: FbxTileJob): FbxTileRow {
  const done = (raw.status ?? "").toUpperCase() === "DONE";
  return {
    kind: "fbx",
    jobId: raw.fbx_job_id ?? null,
    projectId: raw.project_id ?? null,
    tileName: raw.tile_name ?? null,
    status: raw.status ?? null,
    createdAt: raw.created_at ?? null,
    startedAt: raw.started_at ?? null,
    finishedAt: raw.finished_at ?? null,
    // tileset_url 은 모델 원본(/assets/)과 다른 /tiles/ prefix 로 내려온다. 그대로 쓴다.
    tilesetUrls: done && raw.tileset_url ? [raw.tileset_url] : [],
    error: raw.error ?? null,
    options: raw.options ?? null,
  };
}

type ProjectConversionTabProps = {
  projectId: string;
  modelType: ModelTypeConfig;
};

/** GET /api/v1/import/{project_id}/status — 프로젝트 단위 집계 1건 */
type ImportStatusItem = {
  project_id: string;
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  all_done: boolean;
};

function statusTagProps(status?: string | null) {
  const normalized = status?.toUpperCase();
  switch (normalized) {
    case "DONE":
      return { color: "success", icon: <CheckCircleOutlined /> };
    case "RUNNING":
      return { color: "processing", icon: <LoadingOutlined spin /> };
    case "FAILED":
      return { color: "error", icon: <CloseCircleOutlined /> };
    case "PENDING":
      return { color: "warning", icon: <ExclamationCircleOutlined /> };
    default:
      return { color: "default", icon: <ClockCircleOutlined /> };
  }
}

export function ProjectConversionTab({ projectId, modelType }: ProjectConversionTabProps) {
  // 경로·요청 옵션·응답이 파이프라인마다 다르다.
  const isFbx = modelType.tiling === "fbx";

  const [items, setItems] = useState<TileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTile, setSelectedTile] = useState<TileRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusItems, setStatusItems] = useState<ImportStatusItem[]>([]);
  const [converting, setConverting] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<CesiumFeatureInfo | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTile, setInfoTile] = useState<TileRow | null>(null);
  const [showTilesetUrl, setShowTilesetUrl] = useState(false);
  const [showTilesetStatus, setShowTilesetStatus] = useState(false);
  const [tileName, setTileName] = useState("");
  const [maxFeaturesPerTile, setMaxFeaturesPerTile] = useState<number>(
    IFC_DEFAULTS.maxFeaturesPerTile
  );
  const [geometricError, setGeometricError] = useState<number>(IFC_DEFAULTS.geometricError);
  const [crs, setCrs] = useState<string>(FBX_DEFAULTS.crs);
  const [rotateXAxis, setRotateXAxis] = useState<number>(FBX_DEFAULTS.rotateXAxis);
  const [splitByNode, setSplitByNode] = useState<boolean>(FBX_DEFAULTS.splitByNode);
  const pageSize = 11;
  const tileApiBase = modelType.tileApiBase;

  const tilesetRequestUrl = useMemo(() => {
    if (!infoTile?.jobId) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    // FBX 는 타일셋이 한 건이라 별도 조회 엔드포인트 없이 응답의 경로를 그대로 쓴다.
    if (infoTile.kind === "fbx") {
      const url = infoTile.tilesetUrls[0];
      return url ? `${base}${url}` : "";
    }
    return `${base}${tileApiBase}/${projectId}/${infoTile.jobId}/tileset/urls`;
  }, [infoTile, projectId, tileApiBase]);

  const tilesetStatusRows = useMemo(() => {
    if (infoTile?.kind !== "ifc") return [];
    return infoTile.tilesets.map((tileset, index) => ({
      key: `${tileset.ifc_class ?? "class"}-${index}`,
      ifc_class: tileset.ifc_class ?? "-",
      status: tileset.status ?? "PENDING",
    }));
  }, [infoTile]);

  const tilesetUrls = useMemo(() => selectedTile?.tilesetUrls ?? [], [selectedTile]);

  useEffect(() => {
    setSelectedFeature(null);
  }, [selectedTile, detailOpen]);

  useEffect(() => {
    setPage(1);
  }, [projectId, modelType.key]);

  useEffect(() => {
    setShowTilesetUrl(false);
    setShowTilesetStatus(false);
  }, [infoOpen, infoTile]);

  /**
   * 늦게 도착한 응답이 최신 상태를 덮어쓰지 않게 하는 세대 번호.
   * 조회를 시작할 때마다 올리고, 응답을 반영하기 전에 아직 최신인지 확인한다.
   * 폴링·페이지 이동·프로젝트 전환으로 요청이 겹칠 수 있어 필요하다.
   */
  const requestIdRef = useRef(0);

  /**
   * 목록 조회.
   * silent 는 폴링용이다. 전체 스피너로 화면을 덮지 않고 행만 갈아끼운다.
   */
  const fetchTiles = useCallback(
    async (silent = false) => {
      if (!projectId) return;
      const requestId = ++requestIdRef.current;
      const isStale = () => requestId !== requestIdRef.current;

      if (!silent) setLoading(true);
      try {
        if (isFbx) {
          // 프로젝트당 변환 작업 수가 많지 않고 서버 페이지네이션 지원 여부가 확정되지 않아
          // 전량 조회 후 화면에서 끊는다.
          const data = await apiGet<FbxTileJob[]>(`${tileApiBase}/${projectId}/list`);
          if (isStale()) return;
          const rows = (data ?? []).map(normalizeFbxTileJob);
          setTotalCount(rows.length);
          setHasNext(false);
          setItems(rows.slice((page - 1) * pageSize, page * pageSize));
        } else {
          const offset = (page - 1) * pageSize;
          const data = await apiGet<IfcTileJob[]>(
            `${tileApiBase}/${projectId}/list?limit=${pageSize + 1}&offset=${offset}`
          );
          if (isStale()) return;
          const normalized = data ?? [];
          setHasNext(normalized.length > pageSize);
          setTotalCount(null);
          setItems(normalized.slice(0, pageSize).map(normalizeIfcTileJob));
        }
        setError(null);
      } catch (err) {
        if (isStale()) return;
        if (err instanceof Error) setError(err.message);
      } finally {
        if (!silent && !isStale()) setLoading(false);
      }
    },
    [isFbx, page, pageSize, projectId, tileApiBase]
  );

  useEffect(() => {
    void fetchTiles();
    // 조건이 바뀌거나 화면을 떠나면 진행 중이던 응답을 버린다.
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchTiles]);

  // FBX 변환은 워커가 비동기로 돌아 PENDING → RUNNING → DONE/FAILED 로 바뀐다.
  // 진행 중인 작업이 남아 있는 동안만 목록을 다시 읽는다.
  const hasPending = items.some(
    (item) => !TERMINAL_STATUSES.includes((item.status ?? "PENDING").toUpperCase())
  );
  const fetchTilesRef = useRef(fetchTiles);
  fetchTilesRef.current = fetchTiles;

  useEffect(() => {
    if (!isFbx || !hasPending || !projectId) return;
    const timer = window.setInterval(() => {
      // 백그라운드 탭에서까지 서버를 두드릴 이유가 없다. 돌아오면 다음 틱에 따라잡는다.
      if (document.hidden) return;
      void fetchTilesRef.current(true);
    }, FBX_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isFbx, hasPending, projectId]);

  const handleDownload = async (event: MouseEvent<HTMLElement>, record: TileRow) => {
    event.stopPropagation();
    if (!record?.jobId) return;
    if (downloadingId === record.jobId) return;
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
  };

  const columns: ColumnsType<TileRow> = useMemo(() => {
    const base: ColumnsType<TileRow> = [
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
          const props = statusTagProps(value);
          const tag = (
            <Tag color={props.color} icon={props.icon} variant="solid">
              {value || "PENDING"}
            </Tag>
          );
          // 실패 사유는 변환기 원문 로그라 길다. 여기선 힌트만, 전문은 상세에서 본다.
          return record.kind === "fbx" && record.error ? (
            <Tooltip title="자세히에서 실패 로그를 볼 수 있습니다.">{tag}</Tooltip>
          ) : (
            tag
          );
        },
      },
    ];

    // 클래스 단위 집계는 IFC 파이프라인에만 있다.
    if (!isFbx) {
      base.push(
        {
          title: "전체",
          key: "total_classes",
          responsive: ["md"],
          render: (_, record) => (record.kind === "ifc" ? record.classes.total ?? "-" : "-"),
        },
        {
          title: "완료",
          key: "done_classes",
          responsive: ["md"],
          render: (_, record) => (record.kind === "ifc" ? record.classes.done ?? "-" : "-"),
        },
        {
          title: "실패",
          key: "failed_classes",
          responsive: ["md"],
          render: (_, record) => (record.kind === "ifc" ? record.classes.failed ?? "-" : "-"),
        }
      );
    }

    base.push(
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
            onClick={() => {
              setSelectedTile(record);
              setDetailOpen(true);
            }}
            aria-label="View tiles"
          />
        ),
      }
    );

    // FBX 는 타일 zip 다운로드 엔드포인트가 아직 없다.
    if (!isFbx) {
      base.push({
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
      });
    }

    base.push({
      title: "자세히",
      key: "detail",
      align: "center",
      render: (_, record) => (
        <Button
          size="small"
          shape="circle"
          icon={<InfoCircleOutlined />}
          disabled={!record.jobId}
          onClick={() => {
            setInfoTile(record);
            setInfoOpen(true);
          }}
          aria-label="View details"
        />
      ),
    });

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadingId, isFbx, projectId, tileApiBase]);

  /**
   * 변환 작업 생성 모달 열기.
   * IFC 는 임포트가 모두 끝나야 변환할 수 있어 /status 집계를 먼저 읽고 게이팅한다.
   * FBX 는 임포트 단계가 없어 업로드 직후 바로 변환할 수 있다(파일이 없으면 서버가 409).
   */
  const openConvertModal = () => {
    if (!projectId) return;
    setTileName("");
    setMaxFeaturesPerTile(IFC_DEFAULTS.maxFeaturesPerTile);
    setGeometricError(IFC_DEFAULTS.geometricError);
    setCrs(FBX_DEFAULTS.crs);
    setRotateXAxis(FBX_DEFAULTS.rotateXAxis);
    setSplitByNode(FBX_DEFAULTS.splitByNode);
    setStatusError(null);
    setStatusOpen(true);

    if (isFbx) {
      setStatusItems([]);
      setStatusLoading(false);
      return;
    }

    setStatusLoading(true);
    apiGet<ImportStatusItem[] | ImportStatusItem>(
      `${modelType.importApiBase}/${projectId}/status`
    )
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

  const statusSummary = statusItems.reduce(
    (acc, item) => ({
      total: acc.total + (item.total ?? 0),
      running: acc.running + (item.running ?? 0),
      done: acc.done + (item.done ?? 0),
    }),
    { total: 0, running: 0, done: 0 }
  );
  // FBX 는 all_done 게이팅이 없다.
  const canConvert = isFbx || statusItems.some((item) => item.all_done);
  const showOptionForm = isFbx || statusSummary.running === 0;

  const handleConvert = () => {
    if (!projectId) return;
    setConverting(true);
    const trimmedName = tileName.trim();
    const payload: Record<string, unknown> = isFbx
      ? { crs, rotate_x_axis: rotateXAxis, split_by_node: splitByNode }
      : { max_features_per_tile: maxFeaturesPerTile, geometric_error: geometricError };
    if (trimmedName) {
      payload.tile_name = trimmedName;
    }

    apiPost<FbxTileJob | IfcTileJob>(`${tileApiBase}/${projectId}/tiling`, payload)
      .then((created) => {
        if (created) {
          const row = isFbx
            ? normalizeFbxTileJob(created as FbxTileJob)
            : normalizeIfcTileJob(created as IfcTileJob);
          setItems((prev) => [row, ...prev]);
        }
        message.success("변환 작업 요청을 하였습니다.");
        setStatusOpen(false);
        setTileName("");
      })
      .catch((err: unknown) => {
        // 409 는 선행 조건이 맞지 않는 경우다. FBX 는 변환할 파일이 프로젝트에 없을 때.
        if (isApiError(err) && err.status === 409) {
          message.error(
            err.detail ||
              `변환할 ${modelType.shortLabel} 파일이 없습니다. 임포트 탭에서 먼저 업로드해 주세요.`
          );
          return;
        }
        message.error(
          (err instanceof Error && err.message) || "변환 작업 요청에 실패했습니다."
        );
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

  const paginationTotal =
    totalCount ?? (page - 1) * pageSize + items.length + (hasNext ? 1 : 0);

  return (
    <Flex vertical gap={12}>
      <Flex className="detail-header" justify="space-between" align="center" gap={8}>
        <Typography.Text className="models-table-title">{"3D Tiles 상태"}</Typography.Text>
        <Button type="primary" onClick={openConvertModal} disabled={!projectId}>
          작업 생성
        </Button>
      </Flex>

      <div className="models-table">
        {items.length ? (
          <Table
            className="models-table-grid"
            columns={columns}
            dataSource={items}
            rowKey={(record) => String(record.jobId ?? record.projectId)}
            pagination={{
              current: page,
              pageSize,
              total: paginationTotal,
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
        title={isFbx ? `${modelType.shortLabel} 변환 작업 생성` : "작업 상태 분석"}
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
        ) : isFbx || statusItems.length ? (
          <Flex vertical gap={12}>
            <Alert
              showIcon
              type={isFbx ? "info" : statusSummary.running > 0 ? "warning" : "success"}
              message="알림"
              description={
                isFbx
                  ? "프로젝트에 올라간 FBX 전체가 타일셋 하나로 변환됩니다. 같은 프로젝트를 다시 변환하면 새 작업으로 생성되고 이전 결과는 그대로 남습니다."
                  : statusSummary.running > 0
                    ? `현재 임포트 작업이 ${statusSummary.running}개 진행중입니다. \n 작업이 모두 완료된 후 변환을 시도해 주세요`
                    : statusSummary.total === statusSummary.done
                      ? "3D Tiles 변환 실행이 가능합니다."
                      : `전체 임포트 작업 ${statusSummary.total}건중 완료된 작업은 ${statusSummary.done}개입니다. \n 완료된 작업에 대한 변환 실행이 가능합니다.`
              }
            />
            {showOptionForm ? (
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

                {isFbx ? (
                  <>
                    <Flex vertical gap={6}>
                      <Typography.Text>좌표계(crs)</Typography.Text>
                      <Input
                        value={crs}
                        onChange={(event) => setCrs(event.target.value)}
                        placeholder={FBX_DEFAULTS.crs}
                        maxLength={20}
                      />
                      <Typography.Text type="secondary">
                        EPSG 코드 (기본값: {FBX_DEFAULTS.crs}, 중부원점 2010)
                      </Typography.Text>
                    </Flex>
                    <Flex vertical gap={6}>
                      <Typography.Text>X축 회전(rotate_x_axis)</Typography.Text>
                      <InputNumber
                        min={-360}
                        max={360}
                        step={1}
                        value={rotateXAxis}
                        onChange={(value) =>
                          setRotateXAxis(
                            typeof value === "number" ? value : FBX_DEFAULTS.rotateXAxis
                          )
                        }
                        style={{ width: "100%" }}
                      />
                      <Typography.Text type="secondary">
                        Z-up / Y-up 좌표계 보정 각도 (기본값: {FBX_DEFAULTS.rotateXAxis})
                      </Typography.Text>
                    </Flex>
                    <Flex vertical gap={6}>
                      <Typography.Text>노드 단위 분할(split_by_node)</Typography.Text>
                      <Switch
                        checked={splitByNode}
                        onChange={setSplitByNode}
                        style={{ alignSelf: "flex-start" }}
                      />
                      <Typography.Text type="secondary">
                        씬 노드 단위로 타일을 쪼갠다 (기본값: 켜짐)
                      </Typography.Text>
                    </Flex>
                  </>
                ) : (
                  <>
                    <Flex vertical gap={6}>
                      <Typography.Text>
                        타일 당 최대 객체 수(max_features_per_tile)
                      </Typography.Text>
                      <InputNumber
                        min={1}
                        step={1}
                        value={maxFeaturesPerTile}
                        onChange={(value) =>
                          setMaxFeaturesPerTile(
                            typeof value === "number" ? value : IFC_DEFAULTS.maxFeaturesPerTile
                          )
                        }
                        style={{ width: "100%" }}
                      />
                      <Typography.Text type="secondary">
                        값이 커질수록 변환 속도 감소, 용량 증가, 렌더링 성능 저하 (기본값:{" "}
                        {IFC_DEFAULTS.maxFeaturesPerTile})
                      </Typography.Text>
                    </Flex>
                    <Flex vertical gap={6}>
                      <Typography.Text>상세 수준(geometric_error)</Typography.Text>
                      <InputNumber
                        min={0}
                        step={1}
                        value={geometricError}
                        onChange={(value) =>
                          setGeometricError(
                            typeof value === "number" ? value : IFC_DEFAULTS.geometricError
                          )
                        }
                        style={{ width: "100%" }}
                      />
                      <Typography.Text type="secondary">
                        값이 커질수록 덜 상세하게 보여주고 빠르게 전환 (기본값:{" "}
                        {IFC_DEFAULTS.geometricError})
                      </Typography.Text>
                    </Flex>
                  </>
                )}
              </>
            ) : null}
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
            <CesiumViewer tilesetUrls={tilesetUrls} onFeatureSelect={setSelectedFeature} />
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
        title={`${infoTile?.tileName ?? "작업"} 상세정보`}
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
            <Descriptions.Item label="작업 ID">{infoTile.jobId ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="프로젝트 ID">{infoTile.projectId ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="시작시간">{infoTile.startedAt ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="종료시간">{infoTile.finishedAt ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="경과시간">
              {formatDuration(infoTile.startedAt, infoTile.finishedAt, {
                includeSeconds: true,
                empty: "-",
              })}
            </Descriptions.Item>

            {infoTile.kind === "fbx" ? (
              <Descriptions.Item label="변환 옵션">
                {infoTile.options ? (
                  <Flex vertical gap={2}>
                    <Typography.Text>crs: {infoTile.options.crs ?? "-"}</Typography.Text>
                    <Typography.Text>
                      rotate_x_axis: {infoTile.options.rotateXAxis ?? "-"}
                    </Typography.Text>
                    <Typography.Text>
                      split_by_node: {String(infoTile.options.splitByNode ?? "-")}
                    </Typography.Text>
                  </Flex>
                ) : (
                  <Typography.Text type="secondary">없음</Typography.Text>
                )}
              </Descriptions.Item>
            ) : (
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
            )}

            <Descriptions.Item label="접근 URL">
              <Flex vertical gap={8}>
                <Typography.Text type="secondary">
                  {infoTile.kind === "fbx"
                    ? infoTile.tilesetUrls.length
                      ? "타일셋 1건 완료"
                      : "아직 없음"
                    : infoTile.tilesets.length
                      ? `총 ${infoTile.tilesets.length}개 중 ${
                          infoTile.tilesets.filter((t) => t.status === "DONE").length
                        }개 완료`
                      : "없음"}
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

            {infoTile.kind === "fbx" && infoTile.error ? (
              <Descriptions.Item label="실패 로그">
                <Typography.Paragraph
                  style={{
                    margin: 0,
                    maxWidth: 520,
                    maxHeight: 220,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                  copyable={{ text: infoTile.error }}
                >
                  {infoTile.error}
                </Typography.Paragraph>
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        ) : (
          <Empty description="No details" />
        )}
      </Modal>
    </Flex>
  );
}
