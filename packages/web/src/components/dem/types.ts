export type DemItem = {
  dem_id: string;
  job_id?: string | null;
  file_name?: string | null;
  file_path: string;
  file_size?: number | null;
  uploaded_at?: string | null;
  status?: string | null;
  terrain_status?: string | null;
  terrain_download_url?: string | null;
  terrain_tileset_url?: string | null;
  tileset_url?: string | null;
};

export type DemUploadSubmitPayload =
  | { mode: "file"; file: File }
  | { mode: "url"; url: string };
