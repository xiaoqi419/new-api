import { describe, expect, it } from "vitest";

import {
  applyDisplayMultiplier,
  isStatsRange,
  statsRangeWindow,
  USAGE_DISPLAY_MULTIPLIER,
} from "../range";

describe("stats range windows", () => {
  const now = new Date("2026-09-06T15:30:00");

  it("uses local midnight through now for today", () => {
    const window = statsRangeWindow("today", now);
    expect(window.startTimestamp).toBe(Math.floor(new Date("2026-09-06T00:00:00").getTime() / 1000));
    expect(window.endTimestamp).toBe(Math.floor(now.getTime() / 1000));
  });

  it("uses the previous local day for yesterday", () => {
    const window = statsRangeWindow("yesterday", now);
    expect(window.startTimestamp).toBe(Math.floor(new Date("2026-09-05T00:00:00").getTime() / 1000));
    expect(window.endTimestamp).toBe(
      Math.floor(new Date("2026-09-06T00:00:00").getTime() / 1000) - 1,
    );
  });

  it("covers seven local days including today", () => {
    const window = statsRangeWindow("7d", now);
    expect(window.startTimestamp).toBe(Math.floor(new Date("2026-08-31T00:00:00").getTime() / 1000));
    expect(window.endTimestamp).toBe(Math.floor(now.getTime() / 1000));
  });

  it("covers thirty local days including today", () => {
    const window = statsRangeWindow("30d", now);
    expect(window.startTimestamp).toBe(Math.floor(new Date("2026-08-08T00:00:00").getTime() / 1000));
    expect(window.endTimestamp).toBe(Math.floor(now.getTime() / 1000));
  });
});

describe("display multiplier", () => {
  it("multiplies finite values by 2.5", () => {
    expect(USAGE_DISPLAY_MULTIPLIER).toBe(2.5);
    expect(applyDisplayMultiplier(10)).toBe(25);
    expect(applyDisplayMultiplier(0)).toBe(0);
    expect(applyDisplayMultiplier(Number.NaN)).toBe(0);
  });

  it("accepts only the four range keys", () => {
    expect(isStatsRange("today")).toBe(true);
    expect(isStatsRange("year")).toBe(false);
  });
});
