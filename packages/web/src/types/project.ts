export type Project = {
  project_id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
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
