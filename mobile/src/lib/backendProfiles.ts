export type BackendProfileKey = string;

export type BackendProfile = {
  key: BackendProfileKey;
  label: string;
  shortLabel: string;
  apiUrl: string;
  description: string;
  tone: "local" | "server";
  host: string;
};

export const DEFAULT_BACKEND_PROFILE = getConfiguredBackendProfile();

export function getBackendProfile(_key?: string | null): BackendProfile {
  return getConfiguredBackendProfile();
}

function getConfiguredBackendProfile(): BackendProfile {
  const apiUrl = stripTrailingSlash(process.env.EXPO_PUBLIC_API_URL || "http://165.232.64.193:8080/api/v1");
  const host = parseHost(apiUrl);
  const derivedLabel = deriveBackendLabel(host);
  const label = process.env.EXPO_PUBLIC_BACKEND_LABEL || derivedLabel;
  return {
    key: process.env.EXPO_PUBLIC_BACKEND_KEY || apiUrl,
    label,
    shortLabel: process.env.EXPO_PUBLIC_BACKEND_SHORT_LABEL || label.toLocaleUpperCase("tr-TR"),
    apiUrl,
    description: `${host} backend`,
    tone: isLocalHost(host) ? "local" : "server",
    host
  };
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function parseHost(apiUrl: string) {
  try {
    return new URL(apiUrl).host;
  } catch {
    return apiUrl.replace(/^https?:\/\//, "").replace(/\/api\/v1.*$/, "");
  }
}

function deriveBackendLabel(host: string) {
  if (isLocalHost(host)) {
    return "localhost";
  }
  return "server";
}

function isLocalHost(host: string) {
  return host.startsWith("127.0.0.1") || host.startsWith("localhost") || host.startsWith("10.0.2.2");
}
