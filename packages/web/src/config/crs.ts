/**
 * 프로젝트가 쓰는 좌표계. Korea 2000 평면직각좌표계 네 원점만 받는다.
 * 4326 은 도(degree) 단위라 미터 좌표를 그대로 라벨링하면 엉뚱한 위치가 된다.
 */
export const CRS_OPTIONS = [
  { value: "5185", label: "5185 · 서부원점", hint: "서해안" },
  { value: "5186", label: "5186 · 중부원점", hint: "수도권·충청·호남" },
  { value: "5187", label: "5187 · 동부원점", hint: "영남" },
  { value: "5188", label: "5188 · 동해원점", hint: "울릉·독도" },
] as const;

export type CrsCode = (typeof CRS_OPTIONS)[number]["value"];

export const CRS_CODES = CRS_OPTIONS.map((option) => option.value) as readonly CrsCode[];

export function isCrsCode(value: unknown): value is CrsCode {
  return CRS_CODES.includes(value as CrsCode);
}

/** 코드에 붙는 표기. 모르는 코드면 숫자만. */
export function crsLabel(value?: string | number | null): string {
  if (value == null) return "-";
  const code = String(value);
  return CRS_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
