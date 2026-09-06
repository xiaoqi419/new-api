import { describe, expect, it } from "vitest";

import { groupQuotaDataByDay, groupQuotaDataByModel, summarizeQuotaData } from "../api";

const morning = Math.floor(new Date("2026-09-06T01:00:00").getTime() / 1000);
const evening = Math.floor(new Date("2026-09-06T20:00:00").getTime() / 1000);

describe("quota data grouping", () => {
  it("sums points that share a local calendar day", () => {
    const rows = groupQuotaDataByDay([
      { created_at: morning, count: 2, quota: 10, token_used: 4, model_name: "gpt-5" },
      { created_at: evening, count: 3, quota: 5, token_used: 6, model_name: "gpt-4" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(5);
    expect(rows[0]?.quota).toBe(15);
    expect(rows[0]?.tokenUsed).toBe(10);
  });

  it("sums spend per model and sorts by quota", () => {
    const rows = groupQuotaDataByModel([
      { created_at: morning, count: 2, quota: 10, token_used: 4, model_name: "gpt-5" },
      { created_at: evening, count: 1, quota: 40, token_used: 8, model_name: "gpt-5" },
      { created_at: evening, count: 3, quota: 5, token_used: 6, model_name: "gpt-4" },
    ]);
    expect(rows.map((row) => row.model)).toEqual(["gpt-5", "gpt-4"]);
    expect(rows[0]).toMatchObject({ count: 3, quota: 50, tokenUsed: 12 });
  });

  it("keeps card totals equal to the sum of daily rows", () => {
    const snapshot = summarizeQuotaData([
      { created_at: morning, count: 23204, quota: 200_000, token_used: 40, model_name: "gpt-5" },
      { created_at: evening, count: 10, quota: 1_000, token_used: 8, model_name: "gpt-4" },
    ]);
    const daySum = snapshot.days.reduce((sum, row) => sum + row.count, 0);
    const modelSum = snapshot.models.reduce((sum, row) => sum + row.count, 0);
    expect(snapshot.totals.count).toBe(23214);
    expect(snapshot.totals.count).toBe(daySum);
    expect(snapshot.totals.count).toBe(modelSum);
  });
});
