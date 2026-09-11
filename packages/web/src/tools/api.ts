type RequestInitWithJson = RequestInit & { json?: unknown };

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
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
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
