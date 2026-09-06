import { clientFor } from "../../lib/api-client";
import { authStore } from "../../stores/auth-store";
import { isAdminUser, isAuthBundle, type ApiResponse, type AuthBundle } from "./types";

async function restoreSession(): Promise<boolean> {
  const { activeSiteId, sites } = authStore.getState();
  const current = sites[activeSiteId];
  if (typeof current.accessToken === "string" && current.accessToken.trim() && current.user) {
    return isAdminUser(current.user);
  }
  try {
    const response = await clientFor(activeSiteId, true).post<ApiResponse<AuthBundle>>(
      "/api/user/auth/refresh",
    );
    if (
      !response.data.success ||
      !isAuthBundle(response.data.data) ||
      !isAdminUser(response.data.data.user)
    ) {
      return false;
    }
    authStore.getState().installBundle(response.data.data, activeSiteId, current.generation);
    return true;
  } catch {
    return false;
  }
}

let restorePromise: Promise<boolean> | null = null;

export function restoreSessionOnce(): Promise<boolean> {
  restorePromise ??= restoreSession();
  return restorePromise;
}

export function resetSessionRestoreForTests(): void {
  restorePromise = null;
}
