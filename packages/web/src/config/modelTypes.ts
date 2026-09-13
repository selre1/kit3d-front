export type ModelTypeKey = "ifc" | "fbx";

/**
 * 3D Tiles 변환 파이프라인 종류.
 * 엔드포인트·요청 옵션·응답 스키마가 서로 다르다.
 * - `ifc`  : IFC 클래스 단위로 타일셋을 쪼갠다. max_features_per_tile / geometric_error
 * - `fbx`  : 프로젝트의 FBX 전체가 타일셋 하나가 된다. crs / rotate_x_axis / split_by_node
 */
export type TilingPipeline = "ifc" | "fbx";

export type ModelTypeConfig = {
  /** URL 세그먼트이자 메뉴 키로 쓰이는 식별자 */
  key: ModelTypeKey;
  /** 사이드바 메뉴 / 브레드크럼 라벨 */
  label: string;
  /** 배지, 타이틀 등에 쓰는 짧은 표기 */
  shortLabel: string;
  /** 업로드 input 의 accept 속성 */
  accept: string;
  /** 이 타입의 모델 포맷 (소문자, 점 없음). 서버 file_format 과 비교한다. */
  extensions: string[];
  /**
   * 업로드로 받아주는 확장자 (소문자, 점 없음).
   * FBX 는 텍스처(.fbm)를 함께 올리기 위해 zip 컨테이너를 허용하므로 모델 포맷과 다르다.
   */
  uploadExtensions: string[];
  /** 이 타입의 목록 페이지 경로 */
  basePath: string;
  /**
   * 프로젝트 API 의 타입별 base path.
   * 프로젝트는 타입 전용이며 경로가 타입을 결정한다(생성 body 에 타입을 넣지 않는다).
   * 예) 목록 `${projectApiBase}/list`, 생성 `${projectApiBase}/create`
   */
  projectApiBase: string;
  /**
   * 임포트 API 의 타입별 base path.
   * 서버가 포맷별로 엔드포인트를 분리해 목록/업로드/다운로드를 알아서 걸러주므로,
   * 프론트에서 확장자로 다시 거를 필요가 없다.
   * 예) 목록 `${importApiBase}/{project_id}/list`, 업로드 `${importApiBase}/{project_id}/process`
   */
  importApiBase: string;
  /**
   * 3D Tiles API 의 타입별 base path.
   * 예) 변환 `${tileApiBase}/{project_id}/tiling`, 목록 `${tileApiBase}/{project_id}/list`
   */
  tileApiBase: string;
  /** 사이드바 메뉴 키 */
  menuKey: string;
  /** 상세 뷰어 지원 여부 */
  viewer: "ifc" | "none";
  /**
   * 업로드한 파일마다 임포트 작업(import_job)이 생기는지.
   * FBX 는 임포트 단계 없이 파일만 보관되어 status / job_id 가 null 로 내려오고,
   * 재시도할 작업도 /status 집계도 없다. 업로드 직후 바로 변환할 수 있다.
   */
  importJobs: boolean;
  /** 이 타입이 쓰는 변환 파이프라인 */
  tiling: TilingPipeline;
};

export const MODEL_TYPES: Record<ModelTypeKey, ModelTypeConfig> = {
  ifc: {
    key: "ifc",
    label: "IFC 모델",
    shortLabel: "IFC",
    accept: ".ifc",
    extensions: ["ifc"],
    uploadExtensions: ["ifc"],
    basePath: "/models/ifc",
    projectApiBase: "/api/v1/project",
    importApiBase: "/api/v1/import",
    tileApiBase: "/api/v1/tile",
    menuKey: "models:ifc",
    viewer: "ifc",
    importJobs: true,
    tiling: "ifc",
  },
  fbx: {
    key: "fbx",
    label: "FBX 모델",
    shortLabel: "FBX",
    accept: ".zip,.fbx",
    extensions: ["fbx"],
    uploadExtensions: ["fbx", "zip"],
    basePath: "/models/fbx",
    projectApiBase: "/api/v1/project/fbx",
    importApiBase: "/api/v1/import/fbx",
    tileApiBase: "/api/v1/tile/fbx",
    menuKey: "models:fbx",
    viewer: "none",
    importJobs: false,
    tiling: "fbx",
  },
};

export const MODEL_TYPE_LIST: ModelTypeConfig[] = [MODEL_TYPES.ifc, MODEL_TYPES.fbx];

export const DEFAULT_MODEL_TYPE: ModelTypeKey = "ifc";

export function isModelTypeKey(value?: string | null): value is ModelTypeKey {
  return !!value && value in MODEL_TYPES;
}

/** URL 파라미터 등 임의의 문자열을 설정으로 변환한다. 알 수 없으면 기본 타입. */
export function resolveModelType(value?: string | null): ModelTypeConfig {
  return isModelTypeKey(value) ? MODEL_TYPES[value] : MODEL_TYPES[DEFAULT_MODEL_TYPE];
}

/** 메뉴 키(models:ifc)에서 설정을 찾는다. */
export function resolveModelTypeByMenuKey(menuKey: string): ModelTypeConfig | null {
  return MODEL_TYPE_LIST.find((item) => item.menuKey === menuKey) ?? null;
}

/** 파일명에서 확장자만 뽑는다(소문자, 점 없음). */
function fileExtension(fileName?: string | null): string | null {
  const ext = fileName?.split(".").pop()?.trim().toLowerCase();
  return ext || null;
}

/**
 * 파일명 / file_format 이 해당 모델 타입의 포맷인지 판단한다.
 * 서버 file_format 은 확장자에서 파생된 점 없는 소문자이고 null 이 될 수 없다.
 */
export function matchesModelType(
  config: ModelTypeConfig,
  fileName?: string | null,
  fileFormat?: string | null
): boolean {
  const format = fileFormat?.trim().toLowerCase().replace(/^\./, "");
  if (format) {
    return config.extensions.includes(format);
  }
  const ext = fileExtension(fileName);
  return !!ext && config.extensions.includes(ext);
}

/** 업로드 창에서 이 파일을 받아줄지 판단한다(zip 컨테이너 포함). */
export function isUploadableFileName(config: ModelTypeConfig, fileName?: string | null): boolean {
  const ext = fileExtension(fileName);
  return !!ext && config.uploadExtensions.includes(ext);
}
