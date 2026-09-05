import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  apiClient,
  bareApiClient,
  APP_SIGN_IN_PATH,
  handleAuthRecoverySuccess,
} from "../../../lib/api-client";
import { authStore } from "../../../stores/auth-store";
import { login, login2FA, logout, refreshAuth } from "../api";
import { isAuthBundle, type ApiResponse, type AuthBundle } from "../types";

const bundle: AuthBundle = {
  access_token: "access-token-1",
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  authStore.getState().reset();
  handleAuthRecoverySuccess();
  apiClient.defaults.adapter = undefined;
  bareApiClient.defaults.adapter = undefined;
  vi.unstubAllGlobals();
});

describe("auth API", () => {
  it("parses a successful login bundle", async () => {
    const adapter: AxiosAdapter = async (config) =>
      response(config, {
        success: true,
        message: "",
        data: bundle,
      } satisfies ApiResponse<AuthBundle>);
    apiClient.defaults.adapter = adapter;

    const result = await login({ username: "admin", password: "not-a-real-password" });

    expect(result.success).toBe(true);
    expect(isAuthBundle(result.data)).toBe(true);
    if (!isAuthBundle(result.data)) return;
    expect(result.data.access_token).toBe("access-token-1");
    expect(result.data.session.sid).toBe("session-1");
  });

  it("preserves a business response from the 2FA flow", async () => {
    const adapter: AxiosAdapter = async (config) =>
      response(config, {
        success: false,
        message: "验证码错误",
        code: "INVALID_CODE",
      } satisfies ApiResponse<AuthBundle>);
    apiClient.defaults.adapter = adapter;

    const result = await login2FA({ flow_token: "flow-token", code: "000000" });

    expect(result).toEqual({ success: false, message: "验证码错误", code: "INVALID_CODE" });
  });

  it("sends the in-memory SID on refresh", async () => {
    authStore.getState().installBundle(bundle);
    let seenSession = "";
    const adapter: AxiosAdapter = async (config) => {
      seenSession = String(config.headers.get("X-Auth-Session") ?? "");
      return response(config, { success: true, message: "", data: bundle });
    };
    bareApiClient.defaults.adapter = adapter;

    await refreshAuth();

    expect(seenSession).toBe("session-1");
  });

  it("resets auth and navigates when manual refresh fails", async () => {
    authStore.getState().installBundle(bundle);
    const navigate = vi.fn();
    vi.stubGlobal("window", { location: { assign: navigate } });
    bareApiClient.defaults.adapter = async (config) =>
      response(config, { success: false, message: "Session expired" });

    const result = await refreshAuth();

    expect(result).toEqual({ success: false, message: "Session expired" });
    expect(authStore.getState().accessToken).toBeNull();
    expect(authStore.getState().bundle).toBeNull();
    expect(authStore.getState().session).toBeNull();
    expect(navigate).toHaveBeenCalledWith(APP_SIGN_IN_PATH);
  });

  it("allows a second refresh failure to navigate after a successful re-login", async () => {
    authStore.getState().installBundle(bundle);
    const navigate = vi.fn();
    vi.stubGlobal("window", { location: { assign: navigate } });
    let refreshAttempts = 0;
    bareApiClient.defaults.adapter = async (config) => {
      refreshAttempts += 1;
      return response(config, { success: false, message: `Session expired ${refreshAttempts}` });
    };
    apiClient.defaults.adapter = async (config) =>
      response(config, { success: true, message: "", data: bundle });

    await refreshAuth();
    const loginResult = await login({ username: "admin", password: "correct-password" });
    expect(isAuthBundle(loginResult.data)).toBe(true);
    if (isAuthBundle(loginResult.data)) authStore.getState().installBundle(loginResult.data);
    await refreshAuth();

    expect(refreshAttempts).toBe(2);
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenLastCalledWith(APP_SIGN_IN_PATH);
  });

  it("rejects a malformed successful manual refresh and handles it as an auth failure", async () => {
    authStore.getState().installBundle(bundle);
    const navigate = vi.fn();
    vi.stubGlobal("window", { location: { assign: navigate } });
    const malformedResponse = { success: true, message: "", data: { access_token: "incomplete" } };
    bareApiClient.defaults.adapter = async (config) => response(config, malformedResponse);

    await expect(refreshAuth()).rejects.toEqual(malformedResponse);

    expect(authStore.getState().accessToken).toBeNull();
    expect(authStore.getState().bundle).toBeNull();
    expect(authStore.getState().session).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(APP_SIGN_IN_PATH);
  });

  it("refreshes once for concurrent 401s and retries all requests with the new bearer", async () => {
    authStore.getState().installBundle(bundle);
    const refreshedBundle = { ...bundle, access_token: "access-token-2" };
    const originalsFailed = deferred<void>();
    const refreshResponse = deferred<ReturnType<typeof response>>();
    let resourceAttempts = 0;
    let refreshAttempts = 0;
    const retriedAuthorizations: string[] = [];

    apiClient.defaults.adapter = async (config) => {
      resourceAttempts += 1;
      const authConfig = config as InternalAxiosRequestConfig & { _authRetry?: boolean };
      if (!authConfig._authRetry) {
        if (resourceAttempts === 2) originalsFailed.resolve();
        return Promise.reject(unauthorized(config));
      }
      retriedAuthorizations.push(String(config.headers.get("Authorization") ?? ""));
      return response(config, { ok: true });
    };
    bareApiClient.defaults.adapter = async (config) => {
      refreshAttempts += 1;
      return refreshResponse.promise.then(() =>
        response(config, { success: true, message: "", data: refreshedBundle }),
      );
    };

    const requests = [apiClient.get("/api/admin/one"), apiClient.get("/api/admin/two")];
    await originalsFailed.promise;
    await vi.waitFor(() => expect(refreshAttempts).toBe(1));
    refreshResponse.resolve(response({} as InternalAxiosRequestConfig, undefined));

    const results = await Promise.all(requests);

    expect(results.map((result) => result.data)).toEqual([{ ok: true }, { ok: true }]);
    expect(resourceAttempts).toBe(4);
    expect(refreshAttempts).toBe(1);
    expect(retriedAuthorizations).toEqual(["Bearer access-token-2", "Bearer access-token-2"]);
  });

  it("does not perform an infinite second retry", async () => {
    authStore.getState().installBundle(bundle);
    let resourceAttempts = 0;
    let refreshAttempts = 0;

    apiClient.defaults.adapter = async (config) => {
      resourceAttempts += 1;
      return Promise.reject(unauthorized(config));
    };
    bareApiClient.defaults.adapter = async (config) => {
      refreshAttempts += 1;
      return response(config, { success: true, message: "", data: bundle });
    };

    await expect(apiClient.get("/api/admin/resource")).rejects.toBeInstanceOf(AxiosError);
    expect(resourceAttempts).toBe(2);
    expect(refreshAttempts).toBe(1);
  });

  it("logs out without putting the token in the URL", async () => {
    authStore.getState().installBundle(bundle);
    let requestedUrl = "";
    let authorization = "";
    const adapter: AxiosAdapter = async (config) => {
      requestedUrl = config.url ?? "";
      authorization = String(config.headers.get("Authorization") ?? "");
      return response(config, { success: true, message: "", data: null });
    };
    bareApiClient.defaults.adapter = adapter;

    await logout();

    expect(requestedUrl).toBe("/api/user/auth/logout");
    expect(requestedUrl).not.toContain(bundle.access_token);
    expect(authorization).toBe("");
  });
});
