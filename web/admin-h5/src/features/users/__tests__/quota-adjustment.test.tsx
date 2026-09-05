import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../i18n";
import { apiClient } from "../../../lib/api-client";
import { adjustQuota } from "../api";
import { QuotaAdjustSheet } from "../components/QuotaAdjustSheet";
import type { UserDetail } from "../types";

const user: UserDetail = {
  id: 7,
  username: "alice",
  display_name: "Alice",
  email: "alice@example.test",
  role: 1,
  status: 1,
  group: "default",
  quota: 120000,
  used_quota: 30000,
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

function renderSheet(onClose = vi.fn(), queryClient = new QueryClient(), onSuccess = vi.fn()) {
  render(
    <QueryClientProvider client={queryClient}>
      <QuotaAdjustSheet user={user} onClose={onClose} onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return { onClose, queryClient };
}

function fillAndContinue(mode: "Add" | "Subtract" | "Override", value: string) {
  fireEvent.click(screen.getByRole("radio", { name: mode }));
  fireEvent.change(screen.getByLabelText("Balance amount"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  apiClient.defaults.adapter = undefined;
});

describe("quota adjustment", () => {
  it("surfaces an HTTP backend error message", async () => {
    apiClient.defaults.adapter = (async (config) => {
      throw new AxiosError(
        "Request failed with status code 403",
        "ERR_BAD_REQUEST",
        config,
        undefined,
        response(config, { success: false, message: "Permission denied" }),
      );
    }) satisfies AxiosAdapter;

    await expect(
      adjustQuota({ id: 7, action: "add_quota", value: 10, mode: "add" }),
    ).rejects.toThrow("Permission denied");
  });

  it.each([
    ["Add", "add"],
    ["Subtract", "subtract"],
    ["Override", "override"],
  ] as const)("sends the exact %s payload", async (label, mode) => {
    let seenBody: unknown;
    apiClient.defaults.adapter = (async (config) => {
      seenBody = config.data;
      return response(config, { success: true, message: "" });
    }) satisfies AxiosAdapter;

    const { onClose } = renderSheet();
    fillAndContinue(label, mode === "override" ? "0.18" : "0.02");
    fireEvent.click(screen.getByRole("button", { name: "Confirm adjustment" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(seenBody))).toEqual({
      id: 7,
      action: "add_quota",
      value: mode === "override" ? 90000 : 10000,
      mode,
    });
  });

  it("converts decimal balance input to exact internal quota units", async () => {
    let seenBody: unknown;
    apiClient.defaults.adapter = (async (config) => {
      seenBody = config.data;
      return response(config, { success: true, message: "" });
    }) satisfies AxiosAdapter;

    const { onClose } = renderSheet();
    fillAndContinue("Add", "0.1234");
    fireEvent.click(screen.getByRole("button", { name: "Confirm adjustment" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(seenBody))).toMatchObject({
      value: 61700,
      mode: "add",
    });
  });

  it.each(["0", "-1", "9007199254740992", "not-a-number"])("rejects invalid amount %s", (value) => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Balance amount"), { target: { value } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("shows the current-to-result preview and confirmation step", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Balance amount"), { target: { value: "0.02" } });
    expect(screen.getByText("$0.24 → $0.26")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Confirm Add of $0.02 balance.")).toBeInTheDocument();
  });

  it("keeps large quota previews exact without numeric rounding", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Balance amount"), {
      target: { value: "0.1234" },
    });

    expect(screen.getByText("$0.24 → $0.3634")).toBeInTheDocument();
  });

  it.each(["Subtract", "Override"] as const)("warns before %s", (mode) => {
    renderSheet();
    fillAndContinue(mode, "0.02");
    expect(
      screen.getByText(
        mode === "Subtract"
          ? "Subtracting balance is a risky operation."
          : "Overriding balance is a risky operation.",
      ),
    ).toBeInTheDocument();
  });

  it("disables confirmation while one request is pending", async () => {
    let resolveRequest: (() => void) | undefined;
    let requestCount = 0;
    apiClient.defaults.adapter = (() => {
      requestCount += 1;
      return new Promise((resolve) => {
        resolveRequest = () =>
          resolve(response({} as InternalAxiosRequestConfig, { success: true, message: "" }));
      });
    }) satisfies AxiosAdapter;
    renderSheet();
    fillAndContinue("Add", "0.02");
    const confirm = screen.getByRole("button", { name: "Confirm adjustment" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(requestCount).toBe(1));
    expect(confirm).toBeDisabled();
    expect(apiClient.defaults.adapter).toBeDefined();
    resolveRequest?.();
  });

  it("keeps the sheet open and shows the backend failure", async () => {
    apiClient.defaults.adapter = (async (config) =>
      response(config, { success: false, message: "Quota limit reached" })) satisfies AxiosAdapter;
    renderSheet();
    fillAndContinue("Add", "0.02");
    fireEvent.click(screen.getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Quota limit reached"));
    expect(screen.getByDisplayValue("0.02")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("invalidates and refetches both user queries after success", async () => {
    apiClient.defaults.adapter = (async (config) =>
      response(config, { success: true, message: "" })) satisfies AxiosAdapter;
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const refetch = vi.spyOn(queryClient, "refetchQueries");
    const onSuccess = vi.fn();
    const { onClose } = renderSheet(vi.fn(), queryClient, onSuccess);
    fillAndContinue("Add", "0.02");
    fireEvent.click(screen.getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["user-detail", 7] }),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["user-topups", 7] }),
    );
    expect(refetch).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["user-detail", 7] }));
    expect(refetch).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["user-topups", 7] }));
  });

  it("exposes narrow mobile dialog semantics", () => {
    renderSheet();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Subtract" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Override" })).toBeInTheDocument();
  });

  it("moves focus into the dialog, traps Tab, and closes on Escape", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    renderSheet(onClose);

    const close = screen.getByRole("button", { name: "Close" });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancelButton);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    trigger.remove();
  });
});
