type RequestInitWithJson = RequestInit & { json?: unknown };

/**
 * 실패한 HTTP 응답.
 * 서버가 상황을 상태 코드로 구분해 주므로(확장자 400 / 프로젝트 타입·선행조건 409 / 없음 404)
 * 호출부가 코드별로 다른 안내를 띄울 수 있도록 status 와 detail 을 함께 들고 다닌다.
 */
export class ApiError extends Error {
  readonly status: number;
  /** 서버가 준 detail 문구. 없으면 빈 문자열. */
  readonly detail: string;

  constructor(status: number, detail: string, statusText?: string) {
    super(detail || `Request failed: ${status} ${statusText ?? ""}`.trim());
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** FastAPI 는 실패를 {"detail": "..."} 로 내려준다. 형태가 달라도 던지지 않는다. */
async function readDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return "";
    const parsed = JSON.parse(text) as { detail?: unknown };
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    return "";
  } catch {
    return "";
  }
}

async function request<T>(path: string, options?: RequestInitWithJson): Promise<T> {
  const init: RequestInit = { ...options };
  if (options?.json !== undefined) {
    init.body = JSON.stringify(options.json);
    init.headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
  }

  const res = await fetch(`${path}`, init);
  if (!res.ok) {
    throw new ApiError(res.status, await readDetail(res), res.statusText);
  }
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, json: unknown): Promise<T> {
  if (typeof FormData !== "undefined" && json instanceof FormData) {
    return request<T>(path, { method: "POST", body: json });
  }
  return request<T>(path, { method: "POST", json });
}

/** Content-Disposition 헤더에서 파일명을 뽑는다. 없으면 null. */
export function parseContentDispositionFilename(header?: string | null): string | null {
  if (!header) return null;

  // filename*=UTF-8''%ED%95%9C%EA%B8%80.ifc (한글 파일명)
  const encoded = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (encoded) {
    const value = encoded[1].trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  // filename="model.ifc"
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** 파일을 내려받아 저장한다. 서버가 Content-Disposition 을 주면 그 파일명을 우선한다. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const filename =
    parseContentDispositionFilename(res.headers.get("Content-Disposition")) || fallbackName;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
