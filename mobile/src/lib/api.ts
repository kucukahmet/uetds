import { getApiBaseUrl } from "@/lib/config";
import { getFeedbackMessage } from "@/lib/errors";
import { clearSession, getSessionSnapshot, updateSession } from "@/store/sessionRef";

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
  skipCompany?: boolean;
  retryOnUnauthorized?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(getFeedbackMessage(payload, "İstek başarısız oldu."));
    this.status = status;
    this.payload = payload;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawRequest(path, options);
  if (response.status === 401 && options.retryOnUnauthorized !== false && !options.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retry = await rawRequest(path, { ...options, retryOnUnauthorized: false });
      return parseResponse<T>(retry);
    }
    await clearSession();
  }
  return parseResponse<T>(response);
}

export async function apiBinaryRequest(path: string, options: RequestOptions = {}) {
  const requestOptions = { ...options, headers: { ...Object.fromEntries(new Headers(options.headers)), Accept: "application/pdf" } };
  let response = await rawRequest(path, requestOptions);
  if (response.status === 401 && options.retryOnUnauthorized !== false && !options.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await rawRequest(path, { ...requestOptions, retryOnUnauthorized: false });
    } else {
      await clearSession();
    }
  }
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text ? safeJson(text) : null);
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("Content-Type") || "application/octet-stream",
    filename: extractFilename(response.headers.get("Content-Disposition")) || "sefer-detay.pdf"
  };
}

async function rawRequest(path: string, options: RequestOptions = {}) {
  const session = getSessionSnapshot();
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (options.body && !headers.has("Content-Type") && !isFormDataBody(options.body)) {
    headers.set("Content-Type", "application/json");
  }
  if (!options.skipAuth && session.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (!options.skipCompany && session.activeCompanyId) {
    headers.set("X-Company-ID", session.activeCompanyId);
  }
  return fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
}

function isFormDataBody(body: BodyInit | null | undefined) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }
  return payload as T;
}

async function refreshAccessToken() {
  const session = getSessionSnapshot();
  if (!session.refreshToken) {
    return false;
  }
  try {
    const response = await rawRequest("/auth/refresh", {
      method: "POST",
      skipAuth: true,
      skipCompany: true,
      retryOnUnauthorized: false,
      body: JSON.stringify({ refresh: session.refreshToken })
    });
    const payload = await parseResponse<{ access: string; refresh?: string }>(response);
    await updateSession({ accessToken: payload.access, refreshToken: payload.refresh || session.refreshToken });
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function extractFilename(disposition: string | null) {
  if (!disposition) {
    return null;
  }
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || null;
}
