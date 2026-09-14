import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Input,
  InputNumber,
  Modal,
  Spin,
  Switch,
  Typography,
  message,
} from "antd";

import type { ModelTypeConfig } from "../../../../../config/modelTypes";
import { apiGet, apiPost, isApiError } from "../../../../../tools/api";
import type { FbxTileJob, IfcTileJob } from "../../../../../types/project";
import {
  FBX_DEFAULTS,
  IFC_DEFAULTS,
  normalizeFbxTileJob,
  normalizeIfcTileJob,
} from "./types";
import type { ImportStatusItem, TileRow } from "./types";

type ConvertJobModalProps = {
  projectId: string;
  modelType: ModelTypeConfig;
  onClose: () => void;
  onCreated: (row: TileRow) => void;
};

export function ConvertJobModal({
  projectId,
  modelType,
  onClose,
  onCreated,
}: ConvertJobModalProps) {
  const isFbx = modelType.tiling === "fbx";

  // IFC 만 임포트 상태를 먼저 읽어 게이팅한다. FBX 는 곧바로 변환할 수 있다.
  const [statusLoading, setStatusLoading] = useState(!isFbx);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusItems, setStatusItems] = useState<ImportStatusItem[]>([]);
  const [converting, setConverting] = useState(false);

  const [tileName, setTileName] = useState("");
  const [maxFeaturesPerTile, setMaxFeaturesPerTile] = useState<number>(
    IFC_DEFAULTS.maxFeaturesPerTile
  );
  const [geometricError, setGeometricError] = useState<number>(IFC_DEFAULTS.geometricError);
  const [rotateXAxis, setRotateXAxis] = useState<number>(FBX_DEFAULTS.rotateXAxis);
  const [splitByNode, setSplitByNode] = useState<boolean>(FBX_DEFAULTS.splitByNode);

  useEffect(() => {
    if (isFbx || !projectId) return;

    let active = true;
    apiGet<ImportStatusItem[] | ImportStatusItem>(
      `${modelType.importApiBase}/${projectId}/status`
    )
      .then((data) => {
        if (!active) return;
        setStatusItems(Array.isArray(data) ? data : data ? [data] : []);
      })
      .catch((err: Error) => {
        if (!active) return;
        setStatusError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isFbx, projectId, modelType.importApiBase]);

  const summary = statusItems.reduce(
    (acc, item) => ({
      total: acc.total + (item.total ?? 0),
      running: acc.running + (item.running ?? 0),
      done: acc.done + (item.done ?? 0),
    }),
    { total: 0, running: 0, done: 0 }
  );

  const canConvert = isFbx || statusItems.some((item) => item.all_done);
  const showForm = isFbx || summary.running === 0;

  const handleConvert = () => {
    if (!projectId) return;
    setConverting(true);

    const trimmedName = tileName.trim();
    const payload: Record<string, unknown> = isFbx
      ? { rotate_x_axis: rotateXAxis, split_by_node: splitByNode }
      : { max_features_per_tile: maxFeaturesPerTile, geometric_error: geometricError };
    if (trimmedName) payload.tile_name = trimmedName;

    apiPost<FbxTileJob | IfcTileJob>(
      `${modelType.tileApiBase}/${projectId}/tiling`,
      payload
    )
      .then((created) => {
        if (created) {
          onCreated(
            isFbx
              ? normalizeFbxTileJob(created as FbxTileJob)
              : normalizeIfcTileJob(created as IfcTileJob)
          );
        }
        message.success("변환 작업 요청을 하였습니다.");
        onClose();
      })
      .catch((err: unknown) => {
        // 409 = 변환할 파일이 프로젝트에 없음
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
      .finally(() => setConverting(false));
  };

  const alertDescription = isFbx
    ? "프로젝트에 올라간 FBX 전체가 타일셋 하나로 변환됩니다. 같은 프로젝트를 다시 변환하면 새 작업으로 생성되고 이전 결과는 그대로 남습니다."
    : summary.running > 0
      ? `현재 임포트 작업이 ${summary.running}개 진행중입니다. \n 작업이 모두 완료된 후 변환을 시도해 주세요`
      : summary.total === summary.done
        ? "3D Tiles 변환 실행이 가능합니다."
        : `전체 임포트 작업 ${summary.total}건중 완료된 작업은 ${summary.done}개입니다. \n 완료된 작업에 대한 변환 실행이 가능합니다.`;

  return (
    <Modal
      title={isFbx ? `${modelType.shortLabel} 변환 작업 생성` : "작업 상태 분석"}
      open
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
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
            type={isFbx ? "info" : summary.running > 0 ? "warning" : "success"}
            message="알림"
            description={alertDescription}
          />

          {showForm ? (
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
                    <Typography.Text>타일 당 최대 객체 수(max_features_per_tile)</Typography.Text>
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
  );
}
