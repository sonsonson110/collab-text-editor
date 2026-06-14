import { getToken } from "@/auth/tokenStorage";

/**
 * Thin `fetch` wrapper that automatically attaches the stored JWT as a
 * `Authorization: Bearer` header on every request.
 *
 * Only covers `GET` and `POST` since those are the only methods the client
 * currently uses. Extend as needed.
 */

type JsonBody = Record<string, unknown> | undefined;

interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

async function request<T>(
  url: string,
  options: RequestInit,
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const data: T | null = response.status === 204
    ? null
    : await response.json().catch(() => null);

  return { ok: response.ok, status: response.status, data };
}

/**
 * Issues a GET request with the stored JWT attached.
 *
 * @param url The API URL path (e.g. `/api/rooms/abc123`).
 */
export async function apiGet<T>(url: string): Promise<ApiResponse<T>> {
  return request<T>(url, { method: "GET" });
}

/**
 * Issues a POST request with a JSON body and the stored JWT attached.
 *
 * @param url  The API URL path.
 * @param body Optional JSON body.
 */
export async function apiPost<T>(url: string, body?: JsonBody): Promise<ApiResponse<T>> {
  return request<T>(url, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Issues a PATCH request with a JSON body and the stored JWT attached.
 *
 * @param url  The API URL path.
 * @param body Optional JSON body.
 */
export async function apiPatch<T>(url: string, body?: JsonBody): Promise<ApiResponse<T>> {
  return request<T>(url, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Issues a DELETE request with the stored JWT attached.
 *
 * @param url The API URL path.
 */
export async function apiDelete<T>(url: string): Promise<ApiResponse<T>> {
  return request<T>(url, { method: "DELETE" });
}
