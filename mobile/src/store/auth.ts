import { create } from "zustand";

import { apiRequest } from "@/lib/api";
import { deleteStoredValue, getStoredValue, setStoredValue } from "@/lib/storage";
import { getBackendProfileSnapshot } from "@/store/backendRef";
import { registerSessionHandlers, setSessionSnapshot, type SessionSnapshot } from "@/store/sessionRef";
import type { Company, LoginResponse, User } from "@/types/api";

const SESSION_KEY = "uetds.session";

type AuthState = SessionSnapshot & {
  initialized: boolean;
  isAuthenticated: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  setSession: (next: Partial<SessionSnapshot>) => Promise<void>;
  clearLocalSession: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => {
  const persist = async (next: Partial<SessionSnapshot>) => {
    const current = { ...get(), ...next };
    const session: SessionSnapshot = {
      accessToken: current.accessToken,
      refreshToken: current.refreshToken,
      activeCompanyId: current.activeCompanyId,
      user: current.user,
      backendKey: getBackendProfileSnapshot().key
    };
    setSessionSnapshot(session);
    await setStoredValue(SESSION_KEY, JSON.stringify(session));
    set({ ...next, isAuthenticated: Boolean(session.accessToken && session.refreshToken) });
  };

  const clear = async () => {
    setSessionSnapshot({ accessToken: null, refreshToken: null, activeCompanyId: null, user: null, backendKey: null });
    await deleteStoredValue(SESSION_KEY);
    set({ accessToken: null, refreshToken: null, activeCompanyId: null, user: null, backendKey: null, isAuthenticated: false });
  };

  registerSessionHandlers({ update: persist, clear });

  return {
    accessToken: null,
    refreshToken: null,
    activeCompanyId: null,
    user: null,
    initialized: false,
    isAuthenticated: false,
    hydrate: async () => {
      const raw = await getStoredValue(SESSION_KEY);
      if (!raw) {
        set({ initialized: true });
        return;
      }
      const session = JSON.parse(raw) as SessionSnapshot;
      if (session.backendKey !== getBackendProfileSnapshot().key) {
        await clear();
        set({ initialized: true });
        return;
      }
      setSessionSnapshot(session);
      set({ ...session, initialized: true, isAuthenticated: Boolean(session.accessToken && session.refreshToken) });
    },
    login: async (email, password) => {
      const payload = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        skipAuth: true,
        skipCompany: true,
        body: JSON.stringify({ email, password })
      });
      const activeCompanyId = payload.user.active_company_id || payload.user.memberships[0]?.company.id || null;
      await persist({
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        user: payload.user,
        activeCompanyId
      });
    },
    logout: async () => {
      const refresh = get().refreshToken;
      try {
        if (refresh) {
          await apiRequest("/auth/logout", { method: "POST", body: JSON.stringify({ refresh }) });
        }
      } finally {
        await clear();
      }
    },
    switchCompany: async (companyId) => {
      await apiRequest(`/companies/${companyId}/switch/`, { method: "POST", skipCompany: true });
      const user = get().user;
      const nextUser: User | null = user ? { ...user, active_company_id: companyId } : user;
      await persist({ activeCompanyId: companyId, user: nextUser });
    },
    setSession: persist,
    clearLocalSession: clear
  };
});

export function getActiveCompany(user: User | null, activeCompanyId: string | null): Company | null {
  return user?.memberships.find((item) => item.company.id === activeCompanyId)?.company ?? user?.memberships[0]?.company ?? null;
}
