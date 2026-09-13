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

/**
 * 업로드 요청은 200 이지만 개별 파일이 저장되지 않은 사유.
 * 서버가 내려주는 코드가 늘어날 수 있어 임의 문자열도 받는다.
 */
export type ImportSkipReason =
  /** 같은 이름의 파일이 이미 프로젝트에 있음(대소문자 무시) */
  | "duplicate_file_name"
  /** zip 최상위에 모델 파일이 없음 */
  | "no_model_in_archive"
  /** 깨진 zip, 경로 탈출, 엔트리/해제 용량 초과 */
  | "invalid_archive"
  | (string & {});

export type ImportSkippedItem = {
  file_name: string;
  reason: ImportSkipReason;
};

/** IFC 타일링 작업. 타일셋이 IFC 클래스 단위로 쪼개진다. */
export type IfcTileJob = {
  tile_job_id?: string | null;
  project_id?: string | null;
  tile_name?: string | null;
  status?: string | null;
  total_classes?: number | null;
  done_classes?: number | null;
  failed_classes?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  tilesets?: {
    ifc_class?: string | null;
    tileset_url?: string | null;
    status?: string | null;
    error?: string | null;
    updated_at?: string | null;
  }[];
};

/** FBX 타일링 요청 옵션. 전부 선택값이라 비우면 서버 기본값으로 돈다. */
export type FbxTilingOptions = {
  /** EPSG 코드 문자열. 기본 "5187"(중부원점 2010) */
  crs?: string;
  /** Z-up / Y-up 보정 각도. 기본 90 */
  rotate_x_axis?: number;
  /** 씬 노드 단위 분할 여부. 기본 true */
  split_by_node?: boolean;
};

/**
 * FBX 타일링 작업.
 * 프로젝트의 FBX 전체가 타일셋 하나가 되므로 클래스별 분해가 없고,
 * 결과 경로는 tileset_url 한 건이다(모델 원본과 달리 /tiles/ prefix).
 */
export type FbxTileJob = {
  fbx_job_id?: string | null;
  project_id?: string | null;
  tile_name?: string | null;
  status?: string | null;
  tileset_url?: string | null;
  output_dir?: string | null;
  /** FAILED 일 때 변환기 원문 로그(마지막 60줄, 영문) */
  error?: string | null;
  options?: {
    crs?: string | null;
    rotateXAxis?: number | null;
    splitByNode?: boolean | null;
  } | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
};

export type ImportUploadResponse = {
  project_id: string;
  uploaded?: ImportJobItem[];
  skipped?: ImportSkippedItem[];
  items?: ImportJobItem[];
};