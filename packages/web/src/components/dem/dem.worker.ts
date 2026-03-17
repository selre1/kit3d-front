import { fromArrayBuffer } from "geotiff";
import * as THREE from "three";

type WorkerRequest = {
  arrayBuffer: ArrayBuffer;
};

type WorkerSuccess = {
  ok: true;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  minElevation: number;
  maxElevation: number;
  crs: string;
  resolutionXMeter: number;
  resolutionYMeter: number;
  elevations: ArrayBuffer;
  zValues: ArrayBuffer;
  colors: ArrayBuffer;
};

type WorkerFailure = {
  ok: false;
  error: string;
};

const MAX_GRID_SIZE = 1024;

function parseNoDataValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sampleRaster(
  raster: ArrayLike<number>,
  width: number,
  height: number,
  noDataValue: number | null
) {
  //const stepX = Math.max(1, Math.ceil(width / MAX_GRID_SIZE));
  //const stepY = Math.max(1, Math.ceil(height / MAX_GRID_SIZE));

  //const sampledWidth = Math.floor((width - 1) / stepX) + 1;
  //const sampledHeight = Math.floor((height - 1) / stepY) + 1;
  const stepX = 1;
const stepY = 1;
const sampledWidth = width;
const sampledHeight = height;
  const sampled = new Float32Array(sampledWidth * sampledHeight);

  const isNoData = (value: number) =>
    !Number.isFinite(value) || (noDataValue !== null && value === noDataValue);

  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let y = 0; y < sampledHeight; y += 1) {
    const sourceY = Math.min(height - 1, y * stepY);
    for (let x = 0; x < sampledWidth; x += 1) {
      const sourceX = Math.min(width - 1, x * stepX);
      const sourceIndex = sourceY * width + sourceX;
      const targetIndex = y * sampledWidth + x;
      const value = Number(raster[sourceIndex]);

      if (isNoData(value)) {
        sampled[targetIndex] = Number.NaN;
        continue;
      }

      sampled[targetIndex] = value;
      if (value < minElevation) minElevation = value;
      if (value > maxElevation) maxElevation = value;
    }
  }

  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) {
    throw new Error("No valid elevation samples found in GeoTIFF.");
  }

  for (let index = 0; index < sampled.length; index += 1) {
    if (!Number.isFinite(sampled[index])) {
      sampled[index] = minElevation;
    }
  }

  return {
    sampled,
    sampledWidth,
    sampledHeight,
    stepX,
    stepY,
    minElevation,
    maxElevation,
  };
}

function metersPerDegreeLon(latitudeDeg: number) {
  return 111_320 * Math.cos((latitudeDeg * Math.PI) / 180);
}

function toMetersIfDegrees(
  valueX: number,
  valueY: number,
  latCenter: number,
  isGeographic: boolean
) {
  if (!isGeographic) {
    return { x: Math.abs(valueX), y: Math.abs(valueY) };
  }

  return {
    x: Math.abs(valueX) * Math.max(1, metersPerDegreeLon(latCenter)),
    y: Math.abs(valueY) * 111_132,
  };
}

function resolveMetersPerPixel(tifImage: any) {
  const fileDirectory = tifImage.getFileDirectory?.() || {};
  const bbox = tifImage.getBoundingBox?.() as [number, number, number, number] | undefined;

  let scaleX = Number.NaN;
  let scaleY = Number.NaN;
  const modelPixelScale = fileDirectory.ModelPixelScale as number[] | undefined;
  if (Array.isArray(modelPixelScale) && modelPixelScale.length >= 2) {
    scaleX = Number(modelPixelScale[0]);
    scaleY = Number(modelPixelScale[1]);
  }

  if ((!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) && bbox) {
    const [minX, minY, maxX, maxY] = bbox;
    const width = Math.max(1, Number(tifImage.getWidth?.() || 1));
    const height = Math.max(1, Number(tifImage.getHeight?.() || 1));
    scaleX = (maxX - minX) / width;
    scaleY = (maxY - minY) / height;
  }

  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
    return { x: 1, y: 1 };
  }

  const isGeographic =
    !!bbox &&
    Math.abs(bbox[0]) <= 180 &&
    Math.abs(bbox[2]) <= 180 &&
    Math.abs(bbox[1]) <= 90 &&
    Math.abs(bbox[3]) <= 90;
  const latCenter = bbox ? (bbox[1] + bbox[3]) / 2 : 0;

  return toMetersIfDegrees(scaleX, scaleY, latCenter, isGeographic);
}

function resolveCrs(tifImage: any) {
  const geoKeys = (tifImage.getGeoKeys?.() || {}) as Record<string, unknown>;

  const projected =
    Number(geoKeys.ProjectedCSTypeGeoKey) ||
    Number(geoKeys.ProjectedCRSGeoKey) ||
    Number.NaN;
  if (Number.isFinite(projected) && projected > 0 && projected !== 32767) {
    return `EPSG:${Math.trunc(projected)}`;
  }

  const geographic =
    Number(geoKeys.GeographicTypeGeoKey) ||
    Number(geoKeys.GeodeticCRSGeoKey) ||
    Number.NaN;
  if (Number.isFinite(geographic) && geographic > 0 && geographic !== 32767) {
    return `EPSG:${Math.trunc(geographic)}`;
  }

  const citationKeys = [
    geoKeys.GTCitationGeoKey,
    geoKeys.GeogCitationGeoKey,
    geoKeys.PCSCitationGeoKey,
  ];
  for (const citation of citationKeys) {
    if (typeof citation === "string" && citation.trim()) {
      return citation.trim();
    }
  }

  return "알 수 없음";
}

function buildDemAttributes(
  sampled: Float32Array,
  minElevation: number,
  maxElevation: number
) {
  const count = sampled.length;
  const zValues = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const elevationRange = Math.max(maxElevation - minElevation, 1);
  const heightScale = 0.02;
  const verticalExaggeration = 15.0;
  const elevationGamma = 1.0;

  const lowColor = new THREE.Color(0x2b8a3e);
  const midColor = new THREE.Color(0xd9c27a);
  const highColor = new THREE.Color(0xf8f9fa);
  const vertexColor = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const safeValue = sampled[index];
    const elevationRatio = (safeValue - minElevation) / elevationRange;
    const weightedRatio = Math.pow(elevationRatio, elevationGamma);
    const normalizedHeight =
      weightedRatio * elevationRange * heightScale * verticalExaggeration;
    zValues[index] = -normalizedHeight;

    if (weightedRatio < 0.5) {
      vertexColor.copy(lowColor).lerp(midColor, weightedRatio / 0.5);
    } else {
      vertexColor.copy(midColor).lerp(highColor, (weightedRatio - 0.5) / 0.5);
    }

    const colorIndex = index * 3;
    colors[colorIndex] = vertexColor.r;
    colors[colorIndex + 1] = vertexColor.g;
    colors[colorIndex + 2] = vertexColor.b;
  }

  return { zValues, colors };
}

async function buildWorkerPayload(arrayBuffer: ArrayBuffer): Promise<WorkerSuccess> {
  const rawTiff = await fromArrayBuffer(arrayBuffer);
  const tifImage = await rawTiff.getImage();

  const sourceWidth = tifImage.getWidth();
  const sourceHeight = tifImage.getHeight();
  const dataResult = await tifImage.readRasters({ interleave: true, samples: [0] });
  const raster = Array.isArray(dataResult)
    ? (dataResult[0] as ArrayLike<number>)
    : (dataResult as ArrayLike<number>);

  const noDataValue = parseNoDataValue(tifImage.getGDALNoData());
  const sampledData = sampleRaster(raster, sourceWidth, sourceHeight, noDataValue);
  const crs = resolveCrs(tifImage);
  const metersPerPixel = resolveMetersPerPixel(tifImage);
  const resolutionXMeter = Math.max(0.01, metersPerPixel.x * sampledData.stepX);
  const resolutionYMeter = Math.max(0.01, metersPerPixel.y * sampledData.stepY);
  const attributes = buildDemAttributes(
    sampledData.sampled,
    sampledData.minElevation,
    sampledData.maxElevation
  );

  return {
    ok: true,
    width: sampledData.sampledWidth,
    height: sampledData.sampledHeight,
    sourceWidth,
    sourceHeight,
    minElevation: sampledData.minElevation,
    maxElevation: sampledData.maxElevation,
    crs,
    resolutionXMeter,
    resolutionYMeter,
    elevations: sampledData.sampled.buffer,
    zValues: attributes.zValues.buffer,
    colors: attributes.colors.buffer,
  };
}

const workerScope: any = self;

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const payload = await buildWorkerPayload(event.data.arrayBuffer);
    workerScope.postMessage(payload, [payload.elevations, payload.zValues, payload.colors]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build DEM terrain mesh";
    const failure: WorkerFailure = { ok: false, error: message };
    workerScope.postMessage(failure);
  }
};
