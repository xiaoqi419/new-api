import {
  clientFor,
  handleAuthRecoverySuccess,
  handleAuthRefreshFailure,
} from "../../lib/api-client";
import { authStore } from "../../stores/auth-store";
import {
  isAdminUser,
  isAuthBundle,
  type ApiResponse,
  type AuthBundle,
  type LoginRequest,
  type TwoFactorChallenge,
  type TwoFactorLoginRequest,
} from "./types";
import type { SiteId } from "../../env";
export async function login(
  request: LoginRequest,
  siteId: SiteId = authStore.getState().activeSiteId,
): Promise<ApiResponse<AuthBundle | TwoFactorChallenge>> {
  const response = await clientFor(siteId).post<ApiResponse<AuthBundle | TwoFactorChallenge>>(
    "/api/user/login",
    request,
  );
  if (response.data.success && isAuthBundle(response.data.data)) handleAuthRecoverySuccess(siteId);
  return response.data;
}
export async function login2FA(
  request: TwoFactorLoginRequest,
  siteId: SiteId = authStore.getState().activeSiteId,
): Promise<ApiResponse<AuthBundle>> {
  const response = await clientFor(siteId).post<ApiResponse<AuthBundle>>(
    "/api/user/login/2fa",
    request,
  );
  if (response.data.success && isAuthBundle(response.data.data)) handleAuthRecoverySuccess(siteId);
  return response.data;
}
export async function refreshAuth(
  siteId: SiteId = authStore.getState().activeSiteId,
): Promise<ApiResponse<AuthBundle>> {
  const generation = authStore.getState().sites[siteId].generation;
  const sid = authStore.getState().sites[siteId].session?.sid;
  try {
    const response = await clientFor(siteId, true).post<ApiResponse<AuthBundle>>(
      "/api/user/auth/refresh",
      undefined,
      sid ? { headers: { "X-Auth-Session": sid } } : undefined,
    );
    if (!response.data.success) {
      handleAuthRefreshFailure(siteId, generation);
      return response.data;
    }
    if (!isAuthBundle(response.data.data) || !isAdminUser(response.data.data.user)) {
      handleAuthRefreshFailure(siteId, generation);
      throw response.data;
    }
    authStore.getState().installBundle(response.data.data, siteId, generation);
    handleAuthRecoverySuccess(siteId);
    return response.data;
  } catch (error) {
    handleAuthRefreshFailure(siteId, generation);
    throw error;
  }
}
export async function logout(
  sid?: string,
  siteId: SiteId = authStore.getState().activeSiteId,
): Promise<ApiResponse<null>> {
  const sessionId = sid ?? authStore.getState().sites[siteId].session?.sid;
  const response = await clientFor(siteId, true).post<ApiResponse<null>>(
    "/api/user/auth/logout",
    undefined,
    sessionId ? { headers: { "X-Auth-Session": sessionId } } : undefined,
  );
  return response.data;
}
