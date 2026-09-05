import { useCallback } from "react";
import { handleAuthRefreshFailure } from "../../../lib/api-client";
import { useAuthStore } from "../../../stores/auth-store";
import { login, login2FA, logout, refreshAuth } from "../api";
import { isAdminUser, isAuthBundle, type LoginRequest, type TwoFactorLoginRequest } from "../types";
import type { SiteId } from "../../../env";
export function useAuth(siteId: SiteId = useAuthStore((s) => s.activeSiteId)) {
  const auth = useAuthStore();
  const site = auth.sites[siteId];
  const signIn = useCallback(
    async (request: LoginRequest) => {
      const response = await login(request, siteId);
      if (
        response.success &&
        response.data &&
        isAuthBundle(response.data) &&
        isAdminUser(response.data.user)
      )
        auth.installBundle(response.data, siteId);
      return response;
    },
    [auth.installBundle, siteId],
  );
  const verifyTwoFactor = useCallback(
    async (request: TwoFactorLoginRequest) => {
      const response = await login2FA(request, siteId);
      if (
        response.success &&
        response.data &&
        isAuthBundle(response.data) &&
        isAdminUser(response.data.user)
      )
        auth.installBundle(response.data, siteId);
      return response;
    },
    [auth.installBundle, siteId],
  );
  const refresh = useCallback(async () => {
    try {
      const response = await refreshAuth(siteId);
      if (
        response.success &&
        response.data &&
        isAuthBundle(response.data) &&
        isAdminUser(response.data.user)
      )
        auth.installBundle(response.data, siteId, site.generation);
      else if (!response.success) handleAuthRefreshFailure(siteId, site.generation);
      return response;
    } catch (error) {
      handleAuthRefreshFailure(siteId, site.generation);
      throw error;
    }
  }, [auth.installBundle, site.generation, siteId]);
  const signOut = useCallback(
    async (sid?: string) => {
      try {
        return await logout(sid, siteId);
      } finally {
        auth.reset(siteId);
      }
    },
    [auth.reset, siteId],
  );
  return {
    siteId,
    accessToken: site.accessToken,
    bundle: site.bundle,
    user: site.user,
    session: site.session,
    isAuthenticated: site.accessToken !== null,
    signIn,
    verifyTwoFactor,
    refresh,
    signOut,
    reset: () => auth.reset(siteId),
    beginSignIn: () => auth.beginSignIn(siteId),
  };
}
