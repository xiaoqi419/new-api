import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../i18n";
import { apiClient } from "../../../lib/api-client";
import { UserListPage } from "../components/UserListPage";
import { getUsers, searchUsers } from "../api";
import { useUsers } from "../hooks/useUsers";
import { validateUsersSearch } from "../../../routes/users";
import type { PageData, User } from "../types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn().mockResolvedValue(undefined),
  search: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
}));

vi.mock("../hooks/useUsers", () => ({
  useUsers: vi.fn(),
}));

const mockedUseUsers = vi.mocked(useUsers);

const user: User = {
  id: 7,
  username: "alice",
  display_name: "Alice",
  email: "alice@example.com",
  role: 1,
  status: 1,
  group: "default",
  quota: 100,
  used_quota: 25,
};

const page = (items: User[] = [user]): PageData<User> => ({
  page: 1,
  page_size: 20,
  total: items.length,
  items,
});

function response<T>(config: InternalAxiosRequestConfig, data: T) {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  };
}

function renderList(result: Partial<ReturnType<typeof useUsers>> = {}): void {
  mockedUseUsers.mockReturnValue({
    data: page(),
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...result,
  } as ReturnType<typeof useUsers>);
  render(<UserListPage />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.search = {};
  apiClient.defaults.adapter = undefined;
});

describe("users API", () => {
  it("requests the initial page with the default size", async () => {
    let seenUrl = "";
    let seenParams: unknown;
    const adapter: AxiosAdapter = async (config) => {
      seenUrl = config.url ?? "";
      seenParams = config.params;
      return response(config, { success: true, message: "", data: page() });
    };
    apiClient.defaults.adapter = adapter;

    await getUsers({});

    expect(seenUrl).toBe("/api/user/");
    expect(seenParams).toEqual({ p: 1, page_size: 20 });
  });

  it("switches to search endpoint and sends only active filters", async () => {
    let seenUrl = "";
    let seenParams: unknown;
    apiClient.defaults.adapter = async (config) => {
      seenUrl = config.url ?? "";
      seenParams = config.params;
      return response(config, { success: true, message: "", data: page() });
    };

    await searchUsers({ keyword: "alice", status: "1", balance: "" });

    expect(seenUrl).toBe("/api/user/search");
    expect(seenParams).toEqual({ p: 1, page_size: 20, keyword: "alice", status: "1" });
  });

  it("sends the backend disabled status value", async () => {
    let seenParams: unknown;
    apiClient.defaults.adapter = async (config) => {
      seenParams = config.params;
      return response(config, { success: true, message: "", data: page() });
    };

    await searchUsers({ status: "2" });

    expect(seenParams).toEqual({ p: 1, page_size: 20, status: "2" });
  });
});

describe("mobile user list", () => {
  it("shows the empty result state", () => {
    renderList({ data: page([]) });
    expect(screen.getByText("No users found.")).toBeInTheDocument();
  });

  it("renders retry state and retries the request", async () => {
    const refetch = vi.fn();
    renderList({ data: undefined, isError: true, refetch });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("shows the backend error message when loading fails", () => {
    renderList({ data: undefined, isError: true, error: new Error("Permission denied") });

    expect(screen.getByRole("alert")).toHaveTextContent("Permission denied");
  });
  it("resets the page when a status filter changes", () => {
    mocks.search = { page: 3 };
    renderList({ data: { ...page(), total: 60 } });

    fireEvent.click(screen.getByRole("button", { name: "Enabled" }));
    const navigation = mocks.navigate.mock.calls[0][0] as {
      search: (current: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.search({ page: 3 })).toEqual({ page: undefined, status: "1" });
  });

  it("uses status 2 for the disabled filter", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    const navigation = mocks.navigate.mock.calls[0][0] as {
      search: (current: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.search({})).toEqual({ page: undefined, status: "2" });
  });

  it("navigates to a user while preserving search state", () => {
    mocks.search = { keyword: "ali", status: "1", balance: "negative", page: 2 };
    renderList({ data: { ...page(), total: 40 } });

    fireEvent.click(screen.getByRole("button", { name: /Alice alice@example.com/ }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users/$id",
      params: { id: "7" },
      search: { keyword: "ali", status: "1", balance: "negative", page: 2 },
    });
  });

  it("normalizes invalid pages instead of accepting NaN or negative values", () => {
    expect(validateUsersSearch({ page: "NaN" })).toEqual({
      keyword: undefined,
      status: undefined,
      balance: undefined,
      page: undefined,
    });
    expect(validateUsersSearch({ page: "-3" })).toEqual({
      keyword: undefined,
      status: undefined,
      balance: undefined,
      page: undefined,
    });
  });

  it("keeps a compact single-column layout at a narrow mobile width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    renderList();

    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alice alice@example.com/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
