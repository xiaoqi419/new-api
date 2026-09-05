import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APP_SIGN_IN_PATH,
  apiClient,
  bareApiClient,
  handleAuthRecoverySuccess,
} from "../../../lib/api-client";
import { authStore } from "../../../stores/auth-store";
import { logout, refreshAuth } from "../api";
import { isAuthBundle, type AuthBundle } from "../types";

const bundle: AuthBundle = {
  access_token: "access-token",
  token_type: "Bearer",
  access_expires_at: 1_900_000_000,
  user: { id: 7, username: "admin", role: 10 },
  session: {
    sid: "session-1",
    current: true,
    login_method: "password",
    expires_at: 1_900_100_000,
  },
};

const invalidRoleBundles = [
  {
    name: "missing role",
    bundle: { ...bundle, user: { id: 7, username: "user" } },
  },
  {
    name: "bogus role string",
    bundle: { ...bundle, user: { ...bundle.user, role: "bogus" } },
  },
  {
    name: "infinite role",
    bundle: { ...bundle, user: { ...bundle.user, role: Number.POSITIVE_INFINITY } },
  },
] satisfies Array<{ name: string; bundle: AuthBundle }>;

const malformedBundles = [
  { name: "empty access token", bundle: { ...bundle, access_token: "" } },
  { name: "empty session SID", bundle: { ...bundle, session: { ...bundle.session, sid: "" } } },
  {
    name: "invalid access expiry",
    bundle: { ...bundle, access_expires_at: Number.NaN },
  },
  {
    name: "invalid session expiry",
    bundle: { ...bundle, session: { ...bundle.session, expires_at: Number.POSITIVE_INFINITY } },
  },
] satisfies Array<{ name: string; bundle: AuthBundle }>;

function response<T>(config: InternalAxiosRequestConfig, data: T, status = 200) {
  return {
    data,
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    headers: new AxiosHeaders(),
    config,
  };
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(
    "Unauthorized",
    "ERR_BAD_REQUEST",
    config,
    undefined,
    response(config, { success: false, message: "Unauthorized" }, 401),
  );
}

afterEach(() => {
  authStore.getState().reset();
  handleAuthRecoverySuccess();
  apiClient.defaults.adapter = undefined;
  bareApiClient.defaults.adapter = undefined;
  vi.unstubAllGlobals();
});

describe("auth bundle safety", () => {
  it.each(malformedBundles)("rejects $name", ({ bundle: malformedBundle }) => {
    expect(isAuthBundle(malformedBundle)).toBe(false);
  });

  it.each(invalidRoleBundles)(
    "rejects $name from a manual refresh",
    async ({ bundle: invalidBundle }) => {
      authStore.getState().installBundle({ ...bundle, user: { ...bundle.user, role: 10 } });
      const navigate = vi.fn();
      vi.stubGlobal("window", { location: { assign: navigate } });
      bareApiClient.defaults.adapter = (async (config) =>
        response(config, { success: true, message: "", data: invalidBundle })) as AxiosAdapter;

      await expect(refreshAuth()).rejects.toEqual({
        success: true,
        message: "",
        data: invalidBundle,
      });
      expect(authStore.getState().accessToken).toBeNull();
      expect(authStore.getState().session).toBeNull();
      expect(navigate).toHaveBeenCalledWith(APP_SIGN_IN_PATH);
    },
  );

  it.each(invalidRoleBundles)(
    "rejects $name from an automatic 401 refresh",
    async ({ bundle: invalidBundle }) => {
      authStore.getState().installBundle({ ...bundle, user: { ...bundle.user, role: 10 } });
      const navigate = vi.fn();
      vi.stubGlobal("window", { location: { assign: navigate } });
      apiClient.defaults.adapter = async (config) => Promise.reject(unauthorized(config));
      bareApiClient.defaults.adapter = (async (config) =>
        response(config, { success: true, message: "", data: invalidBundle })) as AxiosAdapter;

      await expect(apiClient.get("/api/admin/resource")).rejects.toEqual({
        success: true,
        message: "",
        data: invalidBundle,
      });
      expect(authStore.getState().accessToken).toBeNull();
      expect(authStore.getState().session).toBeNull();
      expect(navigate).toHaveBeenCalledWith(APP_SIGN_IN_PATH);
    },
  );

  it("uses an explicitly supplied SID when logging out a rejected bundle", async () => {
    let seenSession = "";
    bareApiClient.defaults.adapter = (async (config) => {
      seenSession = String(config.headers.get("X-Auth-Session") ?? "");
      return response(config, { success: true, message: "", data: null });
    }) as AxiosAdapter;

    await logout("rejected-session");

    expect(seenSession).toBe("rejected-session");
  });
});
