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
