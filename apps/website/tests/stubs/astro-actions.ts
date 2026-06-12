// Stub for `astro:actions` so Vitest can resolve the import outside an Astro
// build. Tests that exercise action call-sites should mock individual handlers
// via `vi.mock("astro:actions", …)`.
//
// `actions` is exposed as a Proxy that returns a throwing function for any
// property access — so an unmocked test that accidentally calls an action
// fails loudly instead of silently passing.

type AnyFn = (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>;

const throwing: AnyFn = async () => {
  throw new Error(
    "astro:actions stub: action was invoked in a test without a vi.mock(). " +
      "Mock the specific action you need.",
  );
};

export const actions = new Proxy({} as Record<string, AnyFn>, {
  get: () => throwing,
});
