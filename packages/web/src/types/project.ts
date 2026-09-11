import type { ModelTypeKey } from "../config/modelTypes";

export type Project = {
  project_id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
  /** 프로젝트가 속한 모델 타입. 프로젝트는 타입 전용이라 경로로 이미 갈린다. */
  format?: ModelTypeKey | null;
  /** 그 프로젝트의 파일 수. 프로젝트가 한 타입에 속하므로 곧 해당 타입의 모델 수다. */
  models_count?: number | null;
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