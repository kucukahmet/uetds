import type { User } from "@/types/api";

export type SessionSnapshot = {
  accessToken: string | null;
  refreshToken: string | null;
  activeCompanyId: string | null;
  user: User | null;
  backendKey?: string | null;
};

let sessionSnapshot: SessionSnapshot = {
  accessToken: null,
  refreshToken: null,
  activeCompanyId: null,
  user: null,
  backendKey: null
};

let sessionUpdater: ((next: Partial<SessionSnapshot>) => Promise<void>) | null = null;
let sessionClearer: (() => Promise<void>) | null = null;

export function getSessionSnapshot() {
  return sessionSnapshot;
}

export function setSessionSnapshot(next: Partial<SessionSnapshot>) {
  sessionSnapshot = { ...sessionSnapshot, ...next };
}

export function registerSessionHandlers(options: {
  update: (next: Partial<SessionSnapshot>) => Promise<void>;
  clear: () => Promise<void>;
}) {
  sessionUpdater = options.update;
  sessionClearer = options.clear;
}

export async function updateSession(next: Partial<SessionSnapshot>) {
  setSessionSnapshot(next);
  if (sessionUpdater) {
    await sessionUpdater(next);
  }
}

export async function clearSession() {
  setSessionSnapshot({ accessToken: null, refreshToken: null, activeCompanyId: null, user: null, backendKey: null });
  if (sessionClearer) {
    await sessionClearer();
  }
}
