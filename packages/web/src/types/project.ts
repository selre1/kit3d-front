import type { CrsCode } from "../config/crs";
import type { ModelTypeKey } from "../config/modelTypes";

export type Project = {
  project_id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
  /** 프로젝트가 속한 타입. 프로젝트는 한 타입만 담는다. */
  format?: ModelTypeKey | null;
  /** 임포트·변환이 함께 쓰는 좌표계. 생성 시 정하고 이후 바뀌지 않는다. */
  crs: CrsCode;
  /** 이 프로젝트의 파일 수. */
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
 * 업로드는 201 인데 그 파일만 저장되지 않은 사유.
 * 서버가 코드를 추가할 수 있어 임의 문자열도 허용한다.
 */
export type ImportSkipReason =
  /** 같은 이름이 이미 있음. 대소문자 무시 */
  | "duplicate_file_name"
  /** 감싼 폴더를 벗긴 뒤에도 모델 파일이 없음 */
  | "no_model_in_archive"
  /** 깨진 zip, 경로 탈출, 엔트리 2000개·해제 2GB 초과 */
  | "invalid_archive"
  | (string & {});

export type ImportSkippedItem = {
  file_name: string;
  reason: ImportSkipReason;
};

/** IFC 타일링 작업. 타일셋이 IFC 클래스별로 쪼개진다. */
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

/** FBX 타일링 옵션. 전부 선택값. 좌표계는 project.crs 를 쓴다. */
export type FbxTilingOptions = {
  /** Z-up↔Y-up 보정 각도. 기본 90 */
  rotate_x_axis?: number;
  /** 씬 노드 단위로 분할. 기본 true */
  split_by_node?: boolean;
};

/**
 * FBX 타일링 작업. 프로젝트의 FBX 전체가 타일셋 하나가 된다.
 * tileset_url 은 /tiles/ 로 시작한다. 모델 원본(/assets/)과 prefix 가 다르다.
 */
export type FbxTileJob = {
  fbx_job_id?: string | null;
  project_id?: string | null;
  tile_name?: string | null;
  status?: string | null;
  tileset_url?: string | null;
  output_dir?: string | null;
  /** FAILED 일 때 변환기 원문 로그. 마지막 60줄, 영문 */
  error?: string | null;
  options?: {
    /** 요청이 아니라 project.crs 에서 채워져 돌아온다. */
    crs?: CrsCode | null;
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
