import type { FbxTileJob, IfcTileJob } from "../../../../../types/project";

export const PAGE_SIZE = 11;
export const POLL_INTERVAL_MS = 5000;
export const TERMINAL_STATUSES = ["DONE", "FAILED"];

export const FBX_DEFAULTS = {
  crs: "5187",
  rotateXAxis: 90,
  splitByNode: true,
} as const;

export const IFC_DEFAULTS = {
  maxFeaturesPerTile: 1000,
  geometricError: 50,
} as const;

type TileRowBase = {
  jobId: string | null;
  projectId: string | null;
  tileName: string | null;
  status: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  tilesetUrls: string[];
};

export type IfcTileRow = TileRowBase & {
  kind: "ifc";
  classes: { total: number | null; done: number | null; failed: number | null };
  tilesets: NonNullable<IfcTileJob["tilesets"]>;
};

export type FbxTileRow = TileRowBase & {
  kind: "fbx";
  error: string | null;
  options: FbxTileJob["options"];
};

export type TileRow = IfcTileRow | FbxTileRow;

export type ImportStatusItem = {
  project_id: string;
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  all_done: boolean;
};

const isDone = (status?: string | null) => (status ?? "").toUpperCase() === "DONE";

export function normalizeIfcTileJob(raw: IfcTileJob): IfcTileRow {
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
      .filter((tileset) => tileset?.tileset_url && isDone(tileset?.status))
      .map((tileset) => String(tileset.tileset_url)),
    classes: {
      total: raw.total_classes ?? null,
      done: raw.done_classes ?? null,
      failed: raw.failed_classes ?? null,
    },
    tilesets,
  };
}

export function normalizeFbxTileJob(raw: FbxTileJob): FbxTileRow {
  return {
    kind: "fbx",
    jobId: raw.fbx_job_id ?? null,
    projectId: raw.project_id ?? null,
    tileName: raw.tile_name ?? null,
    status: raw.status ?? null,
    createdAt: raw.created_at ?? null,
    startedAt: raw.started_at ?? null,
    finishedAt: raw.finished_at ?? null,
    tilesetUrls: isDone(raw.status) && raw.tileset_url ? [raw.tileset_url] : [],
    error: raw.error ?? null,
    options: raw.options ?? null,
  };
}

export function isPending(row: TileRow) {
  return !TERMINAL_STATUSES.includes((row.status ?? "PENDING").toUpperCase());
}
