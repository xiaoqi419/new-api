import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../i18n";
import { apiClient } from "../../../lib/api-client";
import { UserDetailPage } from "../../../routes/users.$id";
import { getUser, getUserTopUps, parsePositiveUserId, UserNotFoundError } from "../api";
import { useUserDetail, useUserTopUps } from "../hooks/useUserDetail";
import type { PageData, TopUp, UserDetail } from "../types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn().mockResolvedValue(undefined),
  params: { id: "7" },
  search: { keyword: "ali", status: "1" as const, balance: "negative" as const, page: 2 },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    search?: unknown;
    to?: string;
    [key: string]: unknown;
  }) => (
    <a {...props} href={to} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
  useParams: () => mocks.params,
  useSearch: () => mocks.search,
}));

vi.mock("../hooks/useUserDetail", () => ({
  useUserDetail: vi.fn(),
  useUserTopUps: vi.fn(),
}));

const mockedUser = vi.mocked(useUserDetail);
const mockedTopUps = vi.mocked(useUserTopUps);

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

function response<T>(config: InternalAxiosRequestConfig, data: T) {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  };
}

function page(items: TopUp[] = [topUp]): PageData<TopUp> {
  return { page: 1, page_size: 20, total: items.length, items };
}

function renderDetail(
  userResult: Partial<ReturnType<typeof useUserDetail>> = {},
  topUpResult: Partial<ReturnType<typeof useUserTopUps>> = {},
): void {
  mockedUser.mockReturnValue({
    data: user,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...userResult,
  } as ReturnType<typeof useUserDetail>);
  mockedTopUps.mockReturnValue({
    data: page(),
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...topUpResult,
  } as ReturnType<typeof useUserTopUps>);
  render(<UserDetailPage />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.params.id = "7";
  apiClient.defaults.adapter = undefined;
});

describe("user detail API", () => {
  it("requests the selected user and passes the abort signal", async () => {
    let seenUrl = "";
    let hasSignal = false;
    apiClient.defaults.adapter = (async (config) => {
      seenUrl = config.url ?? "";
      hasSignal = config.signal !== undefined;
      return response(config, { success: true, message: "", data: user });
    }) satisfies AxiosAdapter;

    await getUser(7, { signal: new AbortController().signal });

    expect(seenUrl).toBe("/api/user/7");
    expect(hasSignal).toBe(true);
  });

  it("scopes recharge history to the user and sends the fixed page size", async () => {
    let seenUrl = "";
    let seenParams: unknown;
    apiClient.defaults.adapter = (async (config) => {
      seenUrl = config.url ?? "";
      seenParams = config.params;
      return response(config, {
        success: true,
        message: "",
        data: page([topUp, { ...topUp, id: 92, user_id: 8 }]),
      });
    }) satisfies AxiosAdapter;

    const result = await getUserTopUps(7, 2);

    expect(seenUrl).toBe("/api/user/topup");
    expect(seenParams).toEqual({ user_id: 7, p: 2, page_size: 10 });
    expect(result.items).toEqual([topUp]);
    expect(result.total).toBe(1);
  });

  it("surfaces a backend message from an unsuccessful response", async () => {
    apiClient.defaults.adapter = (async (config) =>
      response(config, { success: false, message: "Permission denied" })) satisfies AxiosAdapter;

    await expect(getUser(7)).rejects.toThrow("Permission denied");
  });

  it("maps a backend record-not-found response to UserNotFoundError", async () => {
    apiClient.defaults.adapter = (async (config) =>
      response(config, { success: false, message: "record not found" })) satisfies AxiosAdapter;

    await expect(getUser(7)).rejects.toMatchObject({ name: "UserNotFoundError" });
  });
  it("accepts only positive integer route ids", () => {
    expect(parsePositiveUserId("7")).toBe(7);
    expect(parsePositiveUserId("0")).toBeNull();
    expect(parsePositiveUserId("-1")).toBeNull();
    expect(parsePositiveUserId("7.5")).toBeNull();
  });
});

describe("mobile user detail", () => {
  it("renders identity and quota fields", () => {
    renderDetail();

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Alice Example")).toBeInTheDocument();
    expect(screen.getByText("alice@example.test")).toBeInTheDocument();
    expect(screen.getByText("$0.3")).toBeInTheDocument();
    expect(screen.getByText("$0.24")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
    const tradeDisclosure = screen.getByText("Trade number").closest("details");
    expect(tradeDisclosure).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Trade number"));
    expect(tradeDisclosure).toHaveAttribute("open");
  });

  it("uses a translated fallback for missing identity fields", () => {
    renderDetail({ data: { ...user, display_name: " ", email: "" } });

    expect(screen.getAllByText("Not available")).toHaveLength(2);
  });

  it("returns to users for a valid id whose target is not found", async () => {
    renderDetail({ data: undefined, isError: true, error: new UserNotFoundError() });

    expect(screen.getByText("User not found")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/users",
        search: mocks.search,
        replace: true,
      }),
    );
  });
  it("shows an invalid route without invoking either query", () => {
    mocks.params.id = "not-an-id";
    renderDetail();

    expect(screen.getByText("User not found")).toBeInTheDocument();
    expect(mockedUser).toHaveBeenCalledWith(null);
    expect(mockedTopUps).toHaveBeenCalledWith(null, 1);
  });

  it("shows empty history and preserves list search on the back link", () => {
    renderDetail({}, { data: page([]) });

    expect(screen.getByText("No recharge records found.")).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: "Back to users" });
    expect(backLink).toHaveAttribute("data-search", JSON.stringify(mocks.search));
  });

  it("keeps retry available for generic detail errors", async () => {
    const refetch = vi.fn();
    renderDetail({
      data: undefined,
      isError: true,
      error: new Error("Temporary failure"),
      refetch,
    });

    expect(screen.getByText("Temporary failure")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });
  it("shows retry state and prevents duplicate retry clicks", async () => {
    const refetch = vi.fn();
    renderDetail(
      { data: undefined, isError: true, error: new Error("Permission denied") },
      {
        data: undefined,
        isError: true,
        error: new Error("Topup unavailable"),
        refetch,
        isFetching: true,
      },
    );

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    const retryButtons = screen.getAllByRole("button", { name: "Retrying…" });
    expect(retryButtons[0]).toBeDisabled();
    fireEvent.click(retryButtons[0]);
    await waitFor(() => expect(refetch).not.toHaveBeenCalled());
  });

  it("advances recharge history pagination without changing the detail route", () => {
    renderDetail({}, { data: { ...page(), total: 40 } });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(mockedTopUps).toHaveBeenLastCalledWith(7, 2);
    expect(mocks.params.id).toBe("7");
  });
});
