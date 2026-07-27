import { getBackendProfileSnapshot } from "@/store/backendRef";

export function getApiBaseUrl() {
  return getBackendProfileSnapshot().apiUrl;
}
