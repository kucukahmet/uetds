import { create } from "zustand";

import { getBackendProfile, type BackendProfileKey } from "@/lib/backendProfiles";
import { deleteStoredValue } from "@/lib/storage";
import { setBackendProfileSnapshot } from "@/store/backendRef";

const BACKEND_PROFILE_KEY = "uetds.backend_profile";

type BackendState = {
  initialized: boolean;
  activeKey: BackendProfileKey;
  hydrate: () => Promise<void>;
  reset: () => Promise<void>;
};

export const useBackendStore = create<BackendState>((set) => ({
  initialized: false,
  activeKey: getBackendProfile(null).key,
  hydrate: async () => {
    const profile = getBackendProfile(null);
    await deleteStoredValue(BACKEND_PROFILE_KEY);
    setBackendProfileSnapshot(profile);
    set({ activeKey: profile.key, initialized: true });
  },
  reset: async () => {
    const profile = getBackendProfile(null);
    await deleteStoredValue(BACKEND_PROFILE_KEY);
    setBackendProfileSnapshot(profile);
    set({ activeKey: profile.key });
  },
}));

export function getActiveBackendProfile(_activeKey: BackendProfileKey) {
  return getBackendProfile(null);
}
