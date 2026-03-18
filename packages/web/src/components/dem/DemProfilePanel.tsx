import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Empty, Space, Tag, Typography } from "antd";
import { RiCloseLine, RiDeleteBinLine} from "react-icons/ri";
import { TbChartLine } from "react-icons/tb";
import type { DemProfileResult } from "./types";

const { Text } = Typography;

type DemProfilePanelProps = {
  enabled: boolean;
  profile: DemProfileResult | null;
  onClear: () => void;
  onClose?: () => void;
  onHoverRatioChange?: (ratio: number | null) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function formatValue(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function getSampleIndexByRatio(ratio: number, sampleCount: number) {
  if (!Number.isFinite(ratio) || sampleCount <= 0) return null;
  return clamp(Math.round(ratio * (sampleCount - 1)), 0, sampleCount - 1);
}

function getChartPoint(
  profile: DemProfileResult,
  ratio: number,
  elevation: number,
  width: number,
  height: number,
  padX: number,
  padY: number
) {
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const range = Math.max(profile.maxElevation - profile.minElevation, 0.0001);
  const x = padX + ratio * innerWidth;
  const normalized = (elevation - profile.minElevation) / range;
  const y = padY + (1 - normalized) * innerHeight;
  return { x, y };
}

function buildLinePath(
  profile: DemProfileResult,
  width: number,
  height: number,
  padX: number,
  padY: number
) {
  return profile.samples
    .map((sample, index) => {
      const point = getChartPoint(profile, sample.ratio, sample.elevation, width, height, padX, padY);
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
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

export function DemProfilePanel({
  enabled,
  profile,
  onClear,
  onClose,
  onHoverRatioChange,
}: DemProfilePanelProps) {
  const chartWidth = 360;
  const chartHeight = 180;
  const padX = 24;
  const padY = 16;
  const chartSurfaceRef = useRef<HTMLDivElement | null>(null);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);
  const hoverFrameRef = useRef<number>(0);
  const pendingClientXRef = useRef<number | null>(null);
  const hoverSampleIndexRef = useRef<number | null>(null);
  const [hoverSampleIndex, setHoverSampleIndex] = useState<number | null>(null);
  const [hoverReadoutPos, setHoverReadoutPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [hoverDotPos, setHoverDotPos] = useState<{ x: number; y: number } | null>(null);

  const linePath = profile
    ? buildLinePath(profile, chartWidth, chartHeight, padX, padY)
    : "";
  const areaPath = profile
    ? buildAreaPath(profile, chartWidth, chartHeight, padX, padY)
    : "";

  const applyHoverSampleIndex = useCallback(
    (nextIndex: number | null) => {
      const resolvedIndex =
        profile && nextIndex !== null
          ? clamp(nextIndex, 0, profile.samples.length - 1)
          : null;

      if (hoverSampleIndexRef.current === resolvedIndex) {
        return;
      }

      hoverSampleIndexRef.current = resolvedIndex;
      setHoverSampleIndex(resolvedIndex);

      if (!onHoverRatioChange) {
        return;
      }

      if (!profile || resolvedIndex === null) {
        onHoverRatioChange(null);
        return;
      }

      onHoverRatioChange(profile.samples[resolvedIndex]?.ratio ?? null);
    },
    [onHoverRatioChange, profile]
  );

  const resolveSampleIndexByClientX = useCallback(
    (clientX: number) => {
      if (!profile) return null;
      const chartSvg = chartSvgRef.current;
      if (!chartSvg) return null;

      const rect = chartSvg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const localX = clientX - rect.left;
      if (localX < 0 || localX > rect.width) return null;

      const chartX = (localX / rect.width) * chartWidth;
      if (chartX < padX || chartX > chartWidth - padX) return null;

      const innerWidth = chartWidth - padX * 2;
      if (innerWidth <= 0) return null;

      const ratio = clamp((chartX - padX) / innerWidth, 0, 1);
      return getSampleIndexByRatio(ratio, profile.samples.length);
    },
    [profile, padX, chartWidth]
  );

  const handleChartPointerMove = useCallback(
    (clientX: number) => {
      pendingClientXRef.current = clientX;
      if (hoverFrameRef.current) {
        return;
      }

      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = 0;
        const pendingClientX = pendingClientXRef.current;
        if (pendingClientX === null) return;

        const nextIndex = resolveSampleIndexByClientX(pendingClientX);
        applyHoverSampleIndex(nextIndex);

        const chartSurface = chartSurfaceRef.current;
        const chartSvg = chartSvgRef.current;
        if (!profile || !chartSurface || !chartSvg || nextIndex === null) {
          setHoverReadoutPos(null);
          setHoverDotPos(null);
          return;
        }

        const surfaceRect = chartSurface.getBoundingClientRect();
        const svgRect = chartSvg.getBoundingClientRect();
        if (
          surfaceRect.width <= 0 ||
          surfaceRect.height <= 0 ||
          svgRect.width <= 0 ||
          svgRect.height <= 0
        ) {
          setHoverReadoutPos(null);
          setHoverDotPos(null);
          return;
        }

        const sample = profile.samples[nextIndex];
        if (!sample) {
          setHoverReadoutPos(null);
          setHoverDotPos(null);
          return;
        }

        const point = getChartPoint(
          profile,
          sample.ratio,
          sample.elevation,
          chartWidth,
          chartHeight,
          padX,
          padY
        );
        const pointX =
          svgRect.left -
          surfaceRect.left +
          (point.x / chartWidth) * svgRect.width;
        const pointY =
          svgRect.top -
          surfaceRect.top +
          (point.y / chartHeight) * svgRect.height;
        const clampedX = clamp(pointX, 8, surfaceRect.width - 8);

        setHoverReadoutPos({
          x: clampedX,
          y: 14,
        });
        setHoverDotPos({
          x: clampedX,
          y: clamp(pointY, 8, surfaceRect.height - 8),
        });
      });
    },
    [applyHoverSampleIndex, chartHeight, chartWidth, padX, padY, profile, resolveSampleIndexByClientX]
  );

  const handleChartPointerLeave = useCallback(() => {
    pendingClientXRef.current = null;
    if (hoverFrameRef.current) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = 0;
    }
    applyHoverSampleIndex(null);
    setHoverReadoutPos(null);
    setHoverDotPos(null);
  }, [applyHoverSampleIndex]);

  useEffect(() => {
    if (!enabled || !profile) {
      applyHoverSampleIndex(null);
      setHoverReadoutPos(null);
      setHoverDotPos(null);
    }
  }, [enabled, profile, applyHoverSampleIndex]);

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current) {
        window.cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = 0;
      }
    };
  }, []);

  const hoverSample =
    profile && hoverSampleIndex !== null ? profile.samples[hoverSampleIndex] ?? null : null;
  const hoverPoint =
    profile && hoverSample
      ? getChartPoint(
          profile,
          hoverSample.ratio,
          hoverSample.elevation,
          chartWidth,
          chartHeight,
          padX,
          padY
        )
      : null;

  return (
    <div className="dem-profile-panel">
      <Card
        size="small"
        className="dem-profile-card"
        title={
          <Space size={8}>
            <TbChartLine />
            <span>지형 고도 프로파일 분석</span>
          </Space>
        }
        extra={
          <Space size={8}>
            <Button
              size="small"
              type="text"
              icon={<RiDeleteBinLine />}
              onClick={onClear}
              disabled={!profile}
            >
              초기화
            </Button>
            <Button
              size="small"
              type="text"
              icon={<RiCloseLine />}
              onClick={onClose}
              aria-label="close-profile-panel"
            >
              닫기
            </Button>
          </Space>
        }
      >
        {profile ? (
          <div className="dem-profile-content">
            <div className="dem-profile-metrics">
              <Tag className="dem-profile-metric dem-profile-metric-start">
                P1 {formatValue(profile.startElevation)} m
              </Tag>
              <Tag className="dem-profile-metric dem-profile-metric-end">
                P2 {formatValue(profile.endElevation)} m
              </Tag>
              <Tag className="dem-profile-metric">거리 {formatValue(profile.totalDistanceKm, 2)} km</Tag>
              <Tag className="dem-profile-metric">최저 {formatValue(profile.minElevation)} m</Tag>
              <Tag className="dem-profile-metric">최고 {formatValue(profile.maxElevation)} m</Tag>
            </div>

            <div
              ref={chartSurfaceRef}
              className="dem-profile-chart"
            >
              <svg
                ref={chartSvgRef}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="none"
                aria-label="dem-elevation-profile"
                onPointerMove={(event) => handleChartPointerMove(event.clientX)}
                onPointerLeave={handleChartPointerLeave}
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
                {hoverPoint ? (
                  <>
                    <line
                      x1={hoverPoint.x}
                      y1={padY}
                      x2={hoverPoint.x}
                      y2={chartHeight - padY}
                      className="dem-profile-hover-line"
                    />
                  </>
                ) : null}
              </svg>
              {hoverDotPos ? (
                <div
                  className="dem-profile-hover-dot"
                  style={{ left: `${hoverDotPos.x}px`, top: `${hoverDotPos.y}px` }}
                />
              ) : null}
              <div className="dem-profile-label dem-profile-label-max">
                {formatValue(profile.maxElevation)} m
              </div>
              <div className="dem-profile-label dem-profile-label-min">
                {formatValue(profile.minElevation)} m
              </div>
              {hoverSample && hoverReadoutPos ? (
                <div
                  className="dem-profile-hover-readout"
                  style={{ left: `${hoverReadoutPos.x}px`, top: `${hoverReadoutPos.y}px` }}
                >
                  {formatValue(hoverSample.elevation)} m
                </div>
              ) : null}
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
