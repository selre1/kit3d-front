import type { ModelTypeKey } from "../config/modelTypes";

export type Project = {
  project_id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
  models_count?: number | null;
  /** 포맷별 모델 수. 서버 배포 전에는 내려오지 않으므로 models_count 로 폴백한다. */
  models_count_by_format?: Partial<Record<ModelTypeKey, number>> | null;
};

export type ImportJobItem = {
  file_id: number;
  project_id?: string | null;
  file_name: string;
  file_format?: string | null;
  file_path: string;
  file_url:string;
  file_size?: number | null;
  uploaded_at?: string | null;
  job_id?: string | null;
  job_type?: string | null;
  status?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
};

export type ImportSkippedItem = {
  file_name: string;
  reason: string;
};

export type ImportUploadResponse = {
  project_id: string;
  uploaded?: ImportJobItem[];
  skipped?: ImportSkippedItem[];
  items?: ImportJobItem[];
};