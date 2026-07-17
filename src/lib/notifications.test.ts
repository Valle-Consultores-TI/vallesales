import { describe, expect, it } from "vitest";

import { dedupeNotificationActivities } from "./notifications";

describe("dedupeNotificationActivities", () => {
  it("keeps only one stage-change notification for the same transition within a short window", () => {
    const activities = dedupeNotificationActivities([
      {
        id: "manual",
        lead_id: "lead-1",
        type: "stage_change",
        created_at: "2026-07-17T12:00:02.000Z",
        metadata: { from: "stage-a", to: "stage-b" },
      },
      {
        id: "trigger",
        lead_id: "lead-1",
        type: "stage_change",
        created_at: "2026-07-17T12:00:00.000Z",
        metadata: { from: "stage-a", to: "stage-b" },
      },
    ]);

    expect(activities).toHaveLength(1);
    expect(activities[0]?.id).toBe("manual");
  });

  it("keeps repeated transitions when they happen far apart", () => {
    const activities = dedupeNotificationActivities([
      {
        id: "latest",
        lead_id: "lead-1",
        type: "stage_change",
        created_at: "2026-07-17T12:10:00.000Z",
        metadata: { from: "stage-a", to: "stage-b" },
      },
      {
        id: "earlier",
        lead_id: "lead-1",
        type: "stage_change",
        created_at: "2026-07-17T12:00:00.000Z",
        metadata: { from: "stage-a", to: "stage-b" },
      },
    ]);

    expect(activities).toHaveLength(2);
  });
});
