import { describe, expect, it } from "vitest";

import { groupQuotaDataByDay } from "../api";

describe("groupQuotaDataByDay", () => {
  it("sums points that share a local calendar day", () => {
    const morning = Math.floor(new Date("2026-09-06T01:00:00").getTime() / 1000);
    const evening = Math.floor(new Date("2026-09-06T20:00:00").getTime() / 1000);
    const rows = groupQuotaDataByDay([
      { created_at: morning, count: 2, quota: 10, token_used: 4 },
      { created_at: evening, count: 3, quota: 5, token_used: 6 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(5);
    expect(rows[0]?.quota).toBe(15);
    expect(rows[0]?.tokenUsed).toBe(10);
  });
});
