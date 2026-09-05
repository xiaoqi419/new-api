import { create } from "zustand";
import { defaultSiteId, type SiteId } from "../env";
import {
  isAuthBundle,
  type AuthBundle,
  type AuthUser,
  type LoginSession,
} from "../features/auth/types";
export interface SiteAuthState {
  accessToken: string | null;
  bundle: AuthBundle | null;
  user: AuthUser | null;
  session: LoginSession | null;
  generation: number;
  needsSignIn: boolean;
}
const emptySite = (generation = 0): SiteAuthState => ({
  accessToken: null,
  bundle: null,
  user: null,
  session: null,
  generation,
  needsSignIn: true,
});
export interface AuthState {
  activeSiteId: SiteId;
  sites: Record<SiteId, SiteAuthState>;
  accessToken: string | null;
  bundle: AuthBundle | null;
  user: AuthUser | null;
  session: LoginSession | null;
  setActiveSite: (id: SiteId) => void;
  beginSignIn: (id?: SiteId) => number;
  installBundle: (b: AuthBundle, id?: SiteId, g?: number) => void;
  reset: (id?: SiteId) => void;
  markNeedsSignIn: (id?: SiteId) => void;
}
const initial = () =>
  ({
    activeSiteId: defaultSiteId,
    sites: { domestic: emptySite(), international: emptySite() },
  }) as Pick<AuthState, "activeSiteId" | "sites">;
export const useAuthStore = create<AuthState>((set, get) => ({
  ...initial(),
  accessToken: null,
  bundle: null,
  user: null,
  session: null,
  setActiveSite: (activeSiteId) => {
    const site = get().sites[activeSiteId];
    set({
      activeSiteId,
      accessToken: site.accessToken,
      bundle: site.bundle,
      user: site.user,
      session: site.session,
    });
  },
  beginSignIn: (id = get().activeSiteId) => {
    const generation = get().sites[id].generation + 1;
    set((s) => ({
      sites: { ...s.sites, [id]: emptySite(generation) },
      ...(id === s.activeSiteId
        ? { accessToken: null, bundle: null, user: null, session: null }
        : {}),
    }));
    return generation;
  },
  installBundle: (bundle, id = get().activeSiteId, expected) => {
    if (!isAuthBundle(bundle)) return;
    const current = get().sites[id];
    if (expected !== undefined && current.generation !== expected) return;
    set((s) => ({
      sites: {
        ...s.sites,
        [id]: {
          accessToken: bundle.access_token,
          bundle,
          user: bundle.user,
          session: bundle.session,
          generation: current.generation,
          needsSignIn: false,
        },
      },
      ...(id === s.activeSiteId
        ? { accessToken: bundle.access_token, bundle, user: bundle.user, session: bundle.session }
        : {}),
    }));
  },
  reset: (id = get().activeSiteId) => {
    const current = get().sites[id];
    set((s) => ({
      sites: { ...s.sites, [id]: emptySite(current.generation + 1) },
      ...(id === s.activeSiteId
        ? { accessToken: null, bundle: null, user: null, session: null }
        : {}),
    }));
  },
  markNeedsSignIn: (id = get().activeSiteId) => get().reset(id),
}));
export const authStore = useAuthStore;
export function siteAuth(id: SiteId): SiteAuthState {
  return authStore.getState().sites[id];
}
