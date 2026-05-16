import { describe, expect, test } from "vite-plus/test";
import { getCurrentOrigin, originContext, withOrigin, wrapWithOrigin } from "../src/origin.ts";
import type { Origin } from "../src/origin.ts";

const BASE_ORIGIN: Origin = {
  surface: "admin",
  action: "curate-recipe",
  userInitiated: true,
  runId: "run-abc",
  triggeredBy: "editor",
};

// ── withOrigin ALS plumbing ───────────────────────────────────────────────────

describe("withOrigin", () => {
  test("makes origin available inside the callback via getCurrentOrigin", async () => {
    let captured: Origin | undefined;
    await withOrigin(BASE_ORIGIN, async () => {
      captured = getCurrentOrigin();
    });
    expect(captured).toEqual(BASE_ORIGIN);
  });

  test("origin is not accessible outside the callback", async () => {
    await withOrigin(BASE_ORIGIN, async () => {});
    expect(getCurrentOrigin()).toBeUndefined();
  });

  test("inner withOrigin shadows outer one", async () => {
    const inner: Origin = { ...BASE_ORIGIN, runId: "inner-run" };
    let outerCapture: Origin | undefined;
    let innerCapture: Origin | undefined;

    await withOrigin(BASE_ORIGIN, async () => {
      outerCapture = getCurrentOrigin();
      await withOrigin(inner, async () => {
        innerCapture = getCurrentOrigin();
      });
    });

    expect(outerCapture?.runId).toBe("run-abc");
    expect(innerCapture?.runId).toBe("inner-run");
  });

  test("resolves the returned value", async () => {
    const result = await withOrigin(BASE_ORIGIN, async () => 42);
    expect(result).toBe(42);
  });
});

describe("originContext AsyncLocalStorage", () => {
  test("originContext.getStore() returns undefined outside a run", () => {
    expect(originContext.getStore()).toBeUndefined();
  });
});

describe("wrapWithOrigin", () => {
  test("generates a runId when not provided", async () => {
    const { runId: _, ...configWithoutRunId } = BASE_ORIGIN;
    const handler = wrapWithOrigin(configWithoutRunId);
    let captured: Origin | undefined;
    await handler(async () => {
      captured = getCurrentOrigin();
    })();
    expect(typeof captured?.runId).toBe("string");
    expect(captured?.runId.length).toBeGreaterThan(0);
  });

  test("uses provided runId when given", async () => {
    const handler = wrapWithOrigin({ ...BASE_ORIGIN, runId: "explicit-run" });
    let captured: Origin | undefined;
    await handler(async () => {
      captured = getCurrentOrigin();
    })();
    expect(captured?.runId).toBe("explicit-run");
  });
});
