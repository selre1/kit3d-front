export type DemItem = {
  dem_id: string;
  job_id?: string | null;
  file_name?: string | null;
  file_path: string;
  file_url?: string | null;
  file_size?: number | null;
  created_at?: string | null;
  status?: string | null;
  terrain_status?: string | null;
  terrain_download_url?: string | null;
  terrain_tileset_url?: string | null;
  tileset_url?: string | null;
};

export type DemViewerSource =
  | { mode: "file"; file: File; object_url: string }
  | { mode: "url"; url: string };

export type DemUploadSubmitPayload = { file: File };

export type DemProfilePoint = {
  distance: number;
  elevation: number;
  ratio: number;
};

export type DemProfileResult = {
  totalDistanceMeter: number;
  totalDistanceKm: number;
  minElevation: number;
  maxElevation: number;
  startElevation: number;
  endElevation: number;
  samples: DemProfilePoint[];
};
