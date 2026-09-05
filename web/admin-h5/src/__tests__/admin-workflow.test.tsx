import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import "../i18n";
import { App } from "../App";
import { apiClient } from "../lib/api-client";
import { router } from "../router";
import { authStore } from "../stores/auth-store";
import type { ApiResponse, AuthBundle } from "../features/auth/types";
import type { PageData, TopUp, UserDetail } from "../features/users/types";

const adminBundle: AuthBundle = {
  access_token: "workflow-test-token",
  token_type: "Bearer",
  access_expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 1, username: "workflow-admin", role: 10 },
  session: {
    sid: "workflow-test-session",
    current: true,
    login_method: "test",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  },
};

const user: UserDetail = {
  id: 7,
  username: "alice",
  display_name: "Alice Example",
  email: "alice@example.test",
  role: 1,
  status: 1,
  group: "default",
  quota: 120000,
  used_quota: 30000,
};

const topUp: TopUp = {
  id: 91,
  user_id: 7,
  amount: 50000,
  money: 12.5,
  trade_no: "trade-test-91",
  payment_method: "balance",
  payment_provider: "balance",
  group_buy_id: 0,
  agent_prepay_id: 0,
  create_time: 1_700_000_000,
  complete_time: 1_700_000_100,
  status: "success",
  held_quota: 0,
};

function page<T>(items: T[], pageSize = 20): PageData<T> {
  return { page: 1, page_size: pageSize, total: items.length, items };
}

function response<T>(config: InternalAxiosRequestConfig, data: ApiResponse<T>) {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  };
}

async function installAdminAndRender(
  path: "/users" | "/users/$id",
  id?: string,
  search?: { keyword?: string },
): Promise<void> {
  authStore.getState().installBundle(adminBundle);
  render(<App />);
  if (path === "/users") {
    await router.navigate({ to: "/users", search });
  } else {
    await router.navigate({ to: "/users/$id", params: { id: id ?? "7" } });
  }
}

afterEach(() => {
  cleanup();
  apiClient.defaults.adapter = undefined;
  authStore.getState().reset();
});

describe("admin mobile workflow at the app and network boundary", () => {
  it("searches, opens a user, and confirms a user-scoped quota top-up", async () => {
    let currentUser = user;
    const requests: Array<{ method?: string; url?: string; params?: unknown; data?: unknown }> = [];
    apiClient.defaults.adapter = (async (config) => {
      requests.push({
        method: config.method,
        url: config.url,
        params: config.params,
        data: config.data,
      });
      if (config.method === "post" && config.url === "/api/user/manage") {
        const payload = JSON.parse(String(config.data)) as {
          id: number;
          value: number;
          mode: string;
        };
        expect(payload).toMatchObject({ id: 7, value: 10000, mode: "add" });
        currentUser = { ...currentUser, quota: currentUser.quota + payload.value };
        return response(config, { success: true, message: "" });
      }
      if (config.url === "/api/user/" || config.url === "/api/user/search") {
        return response(config, { success: true, message: "", data: page([user]) });
      }
      if (config.url === "/api/user/7") {
        return response(config, { success: true, message: "", data: currentUser });
      }
      if (config.url === "/api/user/topup") {
        return response(config, { success: true, message: "", data: page([topUp], 10) });
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    }) satisfies AxiosAdapter;

    await installAdminAndRender("/users");
    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search users" });
    fireEvent.change(search, { target: { value: "alice" } });
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.url === "/api/user/search" &&
            request.params &&
            (request.params as { keyword?: string }).keyword === "alice",
        ),
      ).toBe(true),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Alice Example alice@example.test/ }),
    );
    expect(await screen.findByRole("heading", { name: "User details" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.url === "/api/user/topup" &&
            JSON.stringify(request.params).includes('"user_id":7'),
        ),
      ).toBe(true),
    );
    expect(
      requests.some(
        (request) =>
          request.url === "/api/user/topup" && !(request.params as { user_id?: number }).user_id,
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Adjust balance" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "Balance amount" }), {
      target: { value: "0.02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm adjustment" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Balance updated successfully."),
    );
    expect(screen.getByText("$0.26")).toBeInTheDocument();
    expect(requests.filter((request) => request.url === "/api/user/manage")).toHaveLength(1);
    expect(
      requests
        .filter((request) => request.url === "/api/user/topup")
        .every((request) => {
          const params = request.params as { user_id?: number };
          return params.user_id === 7;
        }),
    ).toBe(true);
  });

  it("exposes empty search/history and keeps a 403 quota error in the dialog", async () => {
    apiClient.defaults.adapter = (async (config) => {
      if (config.url === "/api/user/" || config.url === "/api/user/search") {
        return response(config, { success: true, message: "", data: page([]) });
      }
      if (config.url === "/api/user/8") {
        return response(config, { success: true, message: "", data: { ...user, id: 8 } });
      }
      if (config.url === "/api/user/topup") {
        return response(config, { success: true, message: "", data: page([], 10) });
      }
      if (config.url === "/api/user/manage") {
        throw new AxiosError(
          "Request failed with status code 403",
          "ERR_BAD_REQUEST",
          config,
          undefined,
          {
            data: { success: false, message: "Permission denied" },
            status: 403,
            statusText: "Forbidden",
            headers: new AxiosHeaders(),
            config,
          },
        );
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    }) satisfies AxiosAdapter;

    await installAdminAndRender("/users", undefined, { keyword: "nobody" });
    expect(await screen.findByText("No users found.")).toBeInTheDocument();

    await router.navigate({ to: "/users/$id", params: { id: "8" } });
    expect(await screen.findByText("No recharge records found.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adjust balance" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Balance amount" }), {
      target: { value: "0.000002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm adjustment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
