export type ModelTypeKey = "ifc" | "fbx";

/** 변환 파이프라인. 엔드포인트·옵션·응답 스키마가 서로 다르다. */
export type TilingPipeline = "ifc" | "fbx";

export type ModelTypeConfig = {
  key: ModelTypeKey;
  label: string;
  shortLabel: string;
  accept: string;
  /** 서버 file_format 과 비교할 모델 포맷. 소문자, 점 없음. */
  extensions: string[];
  /** 업로드로 받아주는 확장자. FBX 는 텍스처를 함께 올리려고 zip 도 받는다. */
  uploadExtensions: string[];
  /** 목록 페이지 경로. 예) /models/fbx */
  basePath: string;

  // 아래 세 base path 가 타입을 결정한다. 요청 body 나 쿼리에 타입을 넣지 않는다.
  /** 예) `${projectApiBase}/list`, `${projectApiBase}/create` */
  projectApiBase: string;
  /** 예) `${importApiBase}/{projectId}/list`, `.../process` */
  importApiBase: string;
  /** 예) `${tileApiBase}/{projectId}/list`, `.../tiling` */
  tileApiBase: string;

  menuKey: string;
  viewer: "ifc" | "none";
  /** 파일마다 임포트 작업이 생기는지. false 면 status·job_id 가 null 이고 retry 가 없다. */
  importJobs: boolean;
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

/** URL 파라미터를 설정으로 바꾼다. 모르는 값이면 기본 타입. */
export function resolveModelType(value?: string | null): ModelTypeConfig {
  return isModelTypeKey(value) ? MODEL_TYPES[value] : MODEL_TYPES[DEFAULT_MODEL_TYPE];
}

/** 메뉴 키(models:ifc)로 설정을 찾는다. */
export function resolveModelTypeByMenuKey(menuKey: string): ModelTypeConfig | null {
  return MODEL_TYPE_LIST.find((item) => item.menuKey === menuKey) ?? null;
}

/** 확장자를 소문자·점 없이 뽑는다. */
function fileExtension(fileName?: string | null): string | null {
  const ext = fileName?.split(".").pop()?.trim().toLowerCase();
  return ext || null;
}

/** 이 파일이 해당 타입의 모델 포맷인지. file_format 이 있으면 그걸 우선한다. */
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

/** 업로드 창에서 받아줄 파일인지. zip 컨테이너 포함. */
export function isUploadableFileName(config: ModelTypeConfig, fileName?: string | null): boolean {
  const ext = fileExtension(fileName);
  return !!ext && config.uploadExtensions.includes(ext);
}
