import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";

import { bareApiClients } from "../../../lib/api-client";
import { authStore } from "../../../stores/auth-store";
import { resetSessionRestoreForTests, restoreSessionOnce } from "../session-bootstrap";

const adminBundle = {
  access_token: "restored-token",
  token_type: "Bearer",
  access_expires_at: 1_900_000_000,
  user: { id: 1, username: "admin", role: 10 },
  session: {
    sid: "restored-session",
    current: true,
    login_method: "password",
    expires_at: 1_900_100_000,
  },
};

afterEach(() => {
  resetSessionRestoreForTests();
  authStore.getState().reset();
  bareApiClients.domestic.defaults.adapter = undefined;
});

describe("restoreSessionOnce", () => {
  it("restores an admin session from the refresh cookie without requiring a new login", async () => {
    bareApiClients.domestic.defaults.adapter = async (config: InternalAxiosRequestConfig) => ({
      data: { success: true, message: "", data: adminBundle },
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    });

    await expect(restoreSessionOnce()).resolves.toBe(true);
    expect(authStore.getState().accessToken).toBe("restored-token");
  });
});
