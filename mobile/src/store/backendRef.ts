import type { BackendProfile } from "@/lib/backendProfiles";
import { DEFAULT_BACKEND_PROFILE } from "@/lib/backendProfiles";

let backendProfileSnapshot: BackendProfile = DEFAULT_BACKEND_PROFILE;

export function getBackendProfileSnapshot() {
  return backendProfileSnapshot;
}

export function setBackendProfileSnapshot(profile: BackendProfile) {
  backendProfileSnapshot = profile;
}
