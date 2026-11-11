import { describe, expect, it } from "vitest";
import { formatRange, resolveDateRange } from "../src/date-ranges";

// 20:30 UTC on 10 Nov is 00:30 on 11 Nov in Dubai (UTC+4).
const lateUtc = new Date("2026-11-10T20:30:00Z");

describe("resolveDateRange", () => {
  it("counts days on the Dubai calendar", () => {
    expect(resolveDateRange({ range: "today" }, lateUtc)).toMatchObject({ from: "2026-11-11", to: "2026-11-11", label: "Today" });
    expect(resolveDateRange({ range: "yesterday" }, lateUtc)).toMatchObject({ from: "2026-11-10", to: "2026-11-10" });
    expect(resolveDateRange({ range: "7d" }, lateUtc)).toMatchObject({ from: "2026-11-05", to: "2026-11-11" });
    expect(resolveDateRange({ range: "30d" }, lateUtc)).toMatchObject({ from: "2026-10-13", to: "2026-11-11" });
    expect(resolveDateRange({ range: "month" }, lateUtc)).toMatchObject({ from: "2026-11-01", to: "2026-11-11" });
    expect(resolveDateRange({ range: "lastMonth" }, lateUtc)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveDateRange({ range: "year" }, lateUtc)).toMatchObject({ from: "2026-01-01", to: "2026-11-11" });
    expect(resolveDateRange({ range: "all" }, lateUtc)).toMatchObject({ from: null, to: null, label: "All time" });
  });

  it("handles January's last month and unknown presets", () => {
    expect(resolveDateRange({ range: "lastMonth" }, new Date("2026-01-15T08:00:00Z"))).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolveDateRange({ range: "nonsense" }, lateUtc)).toMatchObject({ range: "today", from: "2026-11-11" });
    expect(resolveDateRange({}, lateUtc, "all")).toMatchObject({ range: "all", from: null });
  });

  it("takes a custom range, swapping a reversed one and defaulting the end to the start", () => {
    expect(resolveDateRange({ range: "custom", from: "2026-11-09", to: "2026-11-03" }, lateUtc)).toMatchObject({
      from: "2026-11-03",
      to: "2026-11-09",
      label: "3 – 9 Nov 2026",
    });
    expect(resolveDateRange({ range: "custom", from: "2026-11-03" }, lateUtc)).toMatchObject({ from: "2026-11-03", to: "2026-11-03" });
    expect(resolveDateRange({ range: "custom", from: "bad" }, lateUtc)).toMatchObject({ range: "today" });
  });

  it("formats ranges compactly", () => {
    expect(formatRange("2026-11-03", "2026-11-03")).toBe("3 Nov 2026");
    expect(formatRange("2026-10-28", "2026-11-03")).toBe("28 Oct – 3 Nov 2026");
    expect(formatRange("2025-12-30", "2026-01-02")).toBe("30 Dec 2025 – 2 Jan 2026");
  });
});
