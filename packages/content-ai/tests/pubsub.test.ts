import { describe, test, expect } from "vite-plus/test";
import { subscribe, publish } from "../src/pubsub.ts";

describe("pubsub", () => {
  test("publish notifies subscriber", () => {
    const events: unknown[] = [];
    const unsub = subscribe("run-pub-1", (e) => events.push(e));
    publish("run-pub-1", { type: "test" });
    unsub();
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe("test");
  });

  test("unsubscribe stops notifications", () => {
    const events: unknown[] = [];
    const unsub = subscribe("run-pub-2", (e) => events.push(e));
    unsub();
    publish("run-pub-2", { type: "test" });
    expect(events).toHaveLength(0);
  });

  test("multiple subscribers for same runId all receive the event", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const u1 = subscribe("run-pub-3", (e) => a.push(e));
    const u2 = subscribe("run-pub-3", (e) => b.push(e));
    publish("run-pub-3", { type: "multi" });
    u1();
    u2();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  test("channels are isolated by runId", () => {
    const events: unknown[] = [];
    const unsub = subscribe("run-pub-4", (e) => events.push(e));
    publish("run-pub-5", { type: "other" });
    unsub();
    expect(events).toHaveLength(0);
  });

  test("cleanup removes channel when last subscriber leaves", () => {
    const events: unknown[] = [];
    const u = subscribe("run-pub-6", (e) => events.push(e));
    u();
    // After unsubscribe, publishing does nothing (no error)
    publish("run-pub-6", { type: "after" });
    expect(events).toHaveLength(0);
  });

  test("publishes arbitrary event data", () => {
    const events: unknown[] = [];
    const unsub = subscribe("run-pub-7", (e) => events.push(e));
    publish("run-pub-7", { type: "partial", recipe: { name: "Goulash" }, delta: 42 });
    unsub();
    const ev = events[0] as Record<string, unknown>;
    expect(ev["recipe"]).toEqual({ name: "Goulash" });
    expect(ev["delta"]).toBe(42);
  });
});
