import { useMemo, useState } from "react";
import { Button, Descriptions, Flex, Modal, Typography } from "antd";

import { formatDuration } from "../../../../../utils/format";
import { StatusTag } from "../statusTag";
import type { TileRow } from "./types";

type TileJobDetailModalProps = {
  tile: TileRow;
  projectId: string;
  tileApiBase: string;
  onClose: () => void;
};

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

export function TileJobDetailModal({
  tile,
  projectId,
  tileApiBase,
  onClose,
}: TileJobDetailModalProps) {
  const [showUrl, setShowUrl] = useState(false);
  const [showTilesets, setShowTilesets] = useState(false);

  const requestUrl = useMemo(() => {
    if (!tile.jobId) return "";
    if (tile.kind === "fbx") {
      const url = tile.tilesetUrls[0];
      return url ? `${origin()}${url}` : "";
    }
    return `${origin()}${tileApiBase}/${projectId}/${tile.jobId}/tileset/urls`;
  }, [tile, projectId, tileApiBase]);

  const tilesetRows = useMemo(() => {
    if (tile.kind !== "ifc") return [];
    return tile.tilesets.map((tileset, index) => ({
      key: `${tileset.ifc_class ?? "class"}-${index}`,
      label: tileset.ifc_class ?? "-",
      status: tileset.status ?? "PENDING",
    }));
  }, [tile]);

  const urlSummary =
    tile.kind === "fbx"
      ? tile.tilesetUrls.length
        ? "타일셋 1건 완료"
        : "아직 없음"
      : tile.tilesets.length
        ? `총 ${tile.tilesets.length}개 중 ${
            tile.tilesets.filter((item) => item.status === "DONE").length
          }개 완료`
        : "없음";

  return (
    <Modal
      title={`${tile.tileName ?? "작업"} 상세정보`}
      open
      onCancel={onClose}
      width="fit-content"
      footer={[
        <Button key="close" onClick={onClose}>
          닫기
        </Button>,
      ]}
    >
      <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="작업 ID">{tile.jobId ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="프로젝트 ID">{tile.projectId ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="시작시간">{tile.startedAt ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="종료시간">{tile.finishedAt ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="경과시간">
            {formatDuration(tile.startedAt, tile.finishedAt, {
              includeSeconds: true,
              empty: "-",
            })}
          </Descriptions.Item>

          {tile.kind === "fbx" ? (
            <Descriptions.Item label="변환 옵션">
              {tile.options ? (
                <Flex vertical gap={2}>
                  <Typography.Text>crs: {tile.options.crs ?? "-"}</Typography.Text>
                  <Typography.Text>
                    rotate_x_axis: {tile.options.rotateXAxis ?? "-"}
                  </Typography.Text>
                  <Typography.Text>
                    split_by_node: {String(tile.options.splitByNode ?? "-")}
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
                  onClick={() => setShowTilesets((prev) => !prev)}
                  disabled={!tilesetRows.length}
                >
                  {showTilesets ? "목록 닫기" : "목록 보기"}
                </Button>
                {showTilesets ? (
                  tilesetRows.length ? (
                    <Flex wrap="wrap" gap={8}>
                      {tilesetRows.map((item) => (
                        <StatusTag key={item.key} status={item.status} label={item.label} />
                      ))}
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
              <Typography.Text type="secondary">{urlSummary}</Typography.Text>
              <Button size="small" onClick={() => setShowUrl(true)} disabled={!requestUrl}>
                URL 생성
              </Button>
              {showUrl ? (
                <Typography.Text keyboard copyable style={{ marginTop: 8 }}>
                  {requestUrl || "타일셋이 없습니다."}
                </Typography.Text>
              ) : null}
            </Flex>
          </Descriptions.Item>

          {tile.kind === "fbx" && tile.error ? (
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
                copyable={{ text: tile.error }}
              >
                {tile.error}
              </Typography.Paragraph>
            </Descriptions.Item>
          ) : null}
      </Descriptions>
    </Modal>
  );
}
