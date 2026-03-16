import type { DemProfileResult } from "./types";

export type DemLocalPoint = {
  x: number;
  y: number;
};

export type DemGridData = {
  width: number;
  height: number;
  planeWidth: number;
  planeHeight: number;
  elevations: Float32Array;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function indexOf(width: number, x: number, y: number) {
  return y * width + x;
}

function toGridCoordinate(localValue: number, planeSize: number, gridSize: number) {
  if (gridSize <= 1 || planeSize <= 0) return 0;
  const normalized = (localValue + planeSize / 2) / planeSize;
  return clamp(normalized * (gridSize - 1), 0, gridSize - 1);
}

export function sampleElevation(point: DemLocalPoint, grid: DemGridData) {
  const gx = toGridCoordinate(point.x, grid.planeWidth, grid.width);
  const gy = toGridCoordinate(point.y, grid.planeHeight, grid.height);

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(grid.width - 1, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);

  const tx = gx - x0;
  const ty = gy - y0;

  const e00 = grid.elevations[indexOf(grid.width, x0, y0)];
  const e10 = grid.elevations[indexOf(grid.width, x1, y0)];
  const e01 = grid.elevations[indexOf(grid.width, x0, y1)];
  const e11 = grid.elevations[indexOf(grid.width, x1, y1)];

  const top = e00 + (e10 - e00) * tx;
  const bottom = e01 + (e11 - e01) * tx;
  return top + (bottom - top) * ty;
}

export function buildLineProfile(
  start: DemLocalPoint,
  end: DemLocalPoint,
  grid: DemGridData
): DemProfileResult {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const totalDistance = Math.hypot(dx, dy);
  const sampleCount = clamp(Math.ceil(totalDistance * 1.2), 48, 240);

  const samples = new Array(sampleCount + 1).fill(null).map((_, index) => {
    const ratio = sampleCount === 0 ? 0 : index / sampleCount;
    const point = {
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
    };
    const elevation = sampleElevation(point, grid);
    return {
      distance: totalDistance * ratio,
      elevation,
      ratio,
    };
  });

  const elevations = samples.map((item) => item.elevation);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);

  return {
    totalDistance,
    minElevation,
    maxElevation,
    startElevation: samples[0]?.elevation ?? 0,
    endElevation: samples[samples.length - 1]?.elevation ?? 0,
    samples,
  };
}
