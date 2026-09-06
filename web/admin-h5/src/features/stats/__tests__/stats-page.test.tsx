import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { StatsPage } from "../components/StatsPage";
import { useUsageStats } from "../hooks/useUsageStats";
import { USAGE_DISPLAY_MULTIPLIER } from "../range";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn().mockResolvedValue(undefined),
  search: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
}));

vi.mock("../hooks/useUsageStats", () => ({
  useUsageStats: vi.fn(),
}));

const mockedUseUsageStats = vi.mocked(useUsageStats);

function renderStats(
  result: Partial<ReturnType<typeof useUsageStats>> = {},
): ReturnType<typeof useUsageStats>["refetch"] {
  const refetch = vi.fn();
  mockedUseUsageStats.mockReturnValue({
    data: {
      totals: { quota: 500_000, rpm: 10, tpm: 100 },
      days: [{ day: "2026/9/6", count: 4, quota: 200_000, tokenUsed: 40 }],
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch,
    ...result,
  } as ReturnType<typeof useUsageStats>);
  render(<StatsPage />);
  return refetch;
}

beforeEach(() => {
  void i18n.changeLanguage("zh");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.search = {};
});

describe("StatsPage", () => {
  it("shows 2.5× request, token, and quota totals", () => {
    renderStats();
    expect(screen.getByRole("heading", { name: "用量统计" })).toBeInTheDocument();
    expect(screen.getByText(String(10 * USAGE_DISPLAY_MULTIPLIER))).toBeInTheDocument();
    expect(screen.getByText(String(100 * USAGE_DISPLAY_MULTIPLIER))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今天" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to yesterday when that range is selected", () => {
    renderStats();
    fireEvent.click(screen.getByRole("button", { name: "昨天" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      search: { range: "yesterday" },
      replace: true,
    });
  });

  it("retries after a failed load", () => {
    const refetch = renderStats({ data: undefined, isError: true });
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
