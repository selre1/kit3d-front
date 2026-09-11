export type ModelTypeKey = "ifc" | "fbx";

export type ModelTypeConfig = {
  /** URL 세그먼트이자 메뉴 키로 쓰이는 식별자 */
  key: ModelTypeKey;
  /** 사이드바 메뉴 / 브레드크럼 라벨 */
  label: string;
  /** 배지, 타이틀 등에 쓰는 짧은 표기 */
  shortLabel: string;
  /** 업로드 input 의 accept 속성 */
  accept: string;
  /** 허용 확장자 (소문자, 점 없음) */
  extensions: string[];
  /** 이 타입의 목록 페이지 경로 */
  basePath: string;
  /**
   * 임포트 API 의 타입별 base path.
   * 서버가 포맷별로 엔드포인트를 분리해 목록/업로드/다운로드를 알아서 걸러주므로,
   * 프론트에서 확장자로 다시 거를 필요가 없다.
   * 예) 목록 `${apiBase}/{project_id}/list`, 업로드 `${apiBase}/{project_id}/process`
   */
  apiBase: string;
  /** 사이드바 메뉴 키 */
  menuKey: string;
  /** 상세 뷰어 지원 여부 */
  viewer: "ifc" | "none";
  /**
   * 3D Tiles 변환(타일링) 지원 여부.
   * 서버 타일링 파이프라인이 IFC 클래스 단위라 FBX 는 대상이 아니며,
   * FBX 는 업로드 시 import_job 없이 파일만 보관된다(백엔드 A안).
   * false 이면 변환 탭을 감추고 목록의 작업상태를 "변환 대상 아님"으로 표시한다.
   */
  tiling: boolean;
};

export const MODEL_TYPES: Record<ModelTypeKey, ModelTypeConfig> = {
  ifc: {
    key: "ifc",
    label: "IFC 모델",
    shortLabel: "IFC",
    accept: ".ifc",
    extensions: ["ifc"],
    basePath: "/models/ifc",
    apiBase: "/api/v1/import",
    menuKey: "models:ifc",
    viewer: "ifc",
    tiling: true,
  },
  fbx: {
    key: "fbx",
    label: "FBX 모델",
    shortLabel: "FBX",
    accept: ".fbx",
    extensions: ["fbx"],
    basePath: "/models/fbx",
    apiBase: "/api/v1/import/fbx",
    menuKey: "models:fbx",
    viewer: "none",
    tiling: false,
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

/** 파일명 / file_format 이 해당 모델 타입에 속하는지 판단한다. */
export function matchesModelType(
  config: ModelTypeConfig,
  fileName?: string | null,
  fileFormat?: string | null
): boolean {
  const format = fileFormat?.trim().toLowerCase().replace(/^\./, "");
  if (format) {
    return config.extensions.includes(format);
  }
  const ext = fileName?.split(".").pop()?.trim().toLowerCase();
  return !!ext && config.extensions.includes(ext);
}
