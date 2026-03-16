import { Button, Card, Empty, Space, Statistic, Tag, Typography } from "antd";
import { DeleteOutlined, LineChartOutlined } from "@ant-design/icons";

import type { DemProfileResult } from "./types";

const { Text } = Typography;

type DemProfilePanelProps = {
  enabled: boolean;
  profile: DemProfileResult | null;
  onClear: () => void;
};

function formatValue(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function buildLinePath(
  profile: DemProfileResult,
  width: number,
  height: number,
  padX: number,
  padY: number
) {
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const range = Math.max(profile.maxElevation - profile.minElevation, 0.0001);

  return profile.samples
    .map((sample, index) => {
      const x = padX + sample.ratio * innerWidth;
      const normalized = (sample.elevation - profile.minElevation) / range;
      const y = padY + (1 - normalized) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(
  profile: DemProfileResult,
  width: number,
  height: number,
  padX: number,
  padY: number
) {
  const linePath = buildLinePath(profile, width, height, padX, padY);
  const bottomY = height - padY;
  return `${linePath} L ${width - padX} ${bottomY} L ${padX} ${bottomY} Z`;
}

export function DemProfilePanel({ enabled, profile, onClear }: DemProfilePanelProps) {
  const chartWidth = 360;
  const chartHeight = 180;
  const padX = 24;
  const padY = 16;
  const linePath = profile
    ? buildLinePath(profile, chartWidth, chartHeight, padX, padY)
    : "";
  const areaPath = profile
    ? buildAreaPath(profile, chartWidth, chartHeight, padX, padY)
    : "";

  return (
    <div className="dem-profile-panel">
      <Card
        size="small"
        className="dem-profile-card"
        title={
          <Space size={8}>
            <LineChartOutlined />
            <span>고도 프로파일</span>
          </Space>
        }
        extra={
          <Space size={8}>
            <Tag color={enabled ? "processing" : "default"}>
              {enabled ? "측정 모드 ON" : "측정 모드 OFF"}
            </Tag>
            <Button
              size="small"
              type="text"
              icon={<DeleteOutlined />}
              onClick={onClear}
              disabled={!profile}
            >
              초기화
            </Button>
          </Space>
        }
      >
        {profile ? (
          <div className="dem-profile-content">
            <div className="dem-profile-stats">
              <Statistic
                title="거리"
                value={profile.totalDistance}
                precision={1}
                suffix="grid"
              />
              <Statistic
                title="최저"
                value={profile.minElevation}
                precision={1}
                suffix="m"
              />
              <Statistic
                title="최고"
                value={profile.maxElevation}
                precision={1}
                suffix="m"
              />
            </div>

            <div className="dem-profile-chart">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="none"
                aria-label="dem-elevation-profile"
              >
                <defs>
                  <linearGradient id="demProfileAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(79,157,255,0.45)" />
                    <stop offset="100%" stopColor="rgba(79,157,255,0.05)" />
                  </linearGradient>
                </defs>
                <line
                  x1={padX}
                  y1={padY}
                  x2={padX}
                  y2={chartHeight - padY}
                  className="dem-profile-axis"
                />
                <line
                  x1={padX}
                  y1={chartHeight - padY}
                  x2={chartWidth - padX}
                  y2={chartHeight - padY}
                  className="dem-profile-axis"
                />
                <path d={areaPath} className="dem-profile-area" />
                <path d={linePath} className="dem-profile-line" />
              </svg>
              <div className="dem-profile-label dem-profile-label-max">
                {formatValue(profile.maxElevation)} m
              </div>
              <div className="dem-profile-label dem-profile-label-min">
                {formatValue(profile.minElevation)} m
              </div>
              <div className="dem-profile-label dem-profile-label-start">Start</div>
              <div className="dem-profile-label dem-profile-label-end">End</div>
            </div>
          </div>
        ) : (
          <div className="dem-profile-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Text type="secondary">측정 모드에서 지형 위 두 지점을 선택하면 차트가 생성됩니다.</Text>
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}
