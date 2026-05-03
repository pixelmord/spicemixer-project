import { describe, expect, test } from "vite-plus/test";
import { loadFlags, toggleFlag } from "./capability-flags.ts";
import { InMemoryStore } from "../stores/in-memory.ts";

describe("loadFlags", () => {
  test("returns default flags when store is empty", async () => {
    const store = new InMemoryStore();
    const flags = await loadFlags(store);
    expect(flags).toHaveLength(4);
    expect(flags.map((f) => f.key)).toEqual([
      "github-store-dogfooded",
      "auth-and-moderation",
      "attribution",
      "ai-suppression-proven",
    ]);
    expect(flags.every((f) => f.complete === false)).toBe(true);
    expect(flags.every((f) => f.completedAt === null)).toBe(true);
    expect(flags.every((f) => f.completedBy === null)).toBe(true);
  });

  test("returns persisted flags when store has data", async () => {
    const store = new InMemoryStore();
    const initial = await loadFlags(store);
    await store.put("meta", "readiness/capability-flags", [
      {
        ...initial[0],
        complete: true,
        completedAt: "2026-01-01T00:00:00.000Z",
        completedBy: "test",
      },
      ...initial.slice(1),
    ]);
    const loaded = await loadFlags(store);
    expect(loaded[0].complete).toBe(true);
    expect(loaded[0].completedBy).toBe("test");
    expect(loaded.slice(1).every((f) => f.complete === false)).toBe(true);
  });
});

describe("toggleFlag", () => {
  test("round-trip: load → toggle on → save → reload returns complete=true", async () => {
    const store = new InMemoryStore();
    const flagged = await toggleFlag(store, "github-store-dogfooded", "lead-curator");
    const toggled = flagged.find((f) => f.key === "github-store-dogfooded")!;
    expect(toggled.complete).toBe(true);
    expect(toggled.completedBy).toBe("lead-curator");
    expect(toggled.completedAt).toBeTruthy();

    // Reload from store confirms persistence
    const reloaded = await loadFlags(store);
    expect(reloaded.find((f) => f.key === "github-store-dogfooded")!.complete).toBe(true);
  });

  test("round-trip: toggle off — complete=true → complete=false", async () => {
    const store = new InMemoryStore();
    await toggleFlag(store, "attribution", "admin");
    const afterOff = await toggleFlag(store, "attribution", "admin");
    const flag = afterOff.find((f) => f.key === "attribution")!;
    expect(flag.complete).toBe(false);
    expect(flag.completedAt).toBeNull();
    expect(flag.completedBy).toBeNull();
  });

  test("toggling one flag does not affect others", async () => {
    const store = new InMemoryStore();
    await toggleFlag(store, "auth-and-moderation", "admin");
    const flags = await loadFlags(store);
    const others = flags.filter((f) => f.key !== "auth-and-moderation");
    expect(others.every((f) => f.complete === false)).toBe(true);
  });

  test("throws on unknown key", async () => {
    const store = new InMemoryStore();
    await expect(toggleFlag(store, "not-a-real-flag", "admin")).rejects.toThrow(
      "Unknown capability flag key: not-a-real-flag",
    );
  });

  test("completedAt is an ISO datetime string when toggled on", async () => {
    const store = new InMemoryStore();
    const flags = await toggleFlag(store, "ai-suppression-proven", "admin");
    const flag = flags.find((f) => f.key === "ai-suppression-proven")!;
    expect(() => new Date(flag.completedAt!)).not.toThrow();
    expect(flag.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
