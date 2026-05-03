import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

// viewMode.ts uses browser globals (localStorage, window). We stub them on
// globalThis before each test so the module functions resolve them at call time.

type MockStorage = {
  store: Record<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type MockWindow = {
  _listeners: Record<string, Set<EventListenerOrEventListenerObject>>;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  dispatchEvent: (event: Event) => boolean;
};

function makeMockStorage(): MockStorage {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

function makeMockWindow(): MockWindow {
  const _listeners: Record<string, Set<EventListenerOrEventListenerObject>> = {};
  return {
    _listeners,
    addEventListener: (type, listener) => {
      (_listeners[type] ??= new Set()).add(listener);
    },
    removeEventListener: (type, listener) => {
      _listeners[type]?.delete(listener);
    },
    dispatchEvent: (event) => {
      const listeners = _listeners[event.type];
      if (listeners) {
        for (const listener of listeners) {
          if (typeof listener === "function") listener(event);
          else listener.handleEvent(event);
        }
      }
      return true;
    },
  };
}

let mockStorage: MockStorage;
let mockWin: MockWindow;

beforeEach(() => {
  mockStorage = makeMockStorage();
  mockWin = makeMockWindow();
  vi.stubGlobal("localStorage", mockStorage);
  vi.stubGlobal("window", mockWin);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function importViewMode() {
  return import("../../src/lib/viewMode.ts?ts=" + Date.now());
}

describe("getViewMode", () => {
  test("returns 'default' when localStorage is empty", async () => {
    const { getViewMode } = await importViewMode();
    expect(getViewMode()).toBe("default");
  });

  test("returns 'cook' when localStorage holds 'cook'", async () => {
    mockStorage.store["spicemixer.viewMode"] = "cook";
    const { getViewMode } = await importViewMode();
    expect(getViewMode()).toBe("cook");
  });

  test("returns 'default' for unrecognized stored value", async () => {
    mockStorage.store["spicemixer.viewMode"] = "bogus";
    const { getViewMode } = await importViewMode();
    expect(getViewMode()).toBe("default");
  });

  test("returns 'default' when localStorage.getItem throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    });
    const { getViewMode } = await importViewMode();
    expect(getViewMode()).toBe("default");
  });
});

describe("setViewMode", () => {
  test("writes 'cook' to localStorage", async () => {
    const { setViewMode } = await importViewMode();
    setViewMode("cook");
    expect(mockStorage.store["spicemixer.viewMode"]).toBe("cook");
  });

  test("writes 'default' to localStorage", async () => {
    mockStorage.store["spicemixer.viewMode"] = "cook";
    const { setViewMode } = await importViewMode();
    setViewMode("default");
    expect(mockStorage.store["spicemixer.viewMode"]).toBe("default");
  });

  test("dispatches viewmodechange CustomEvent on window", async () => {
    const { setViewMode } = await importViewMode();
    const dispatched: Event[] = [];
    mockWin.addEventListener("viewmodechange", (e) => dispatched.push(e));
    setViewMode("cook");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe("viewmodechange");
  });

  test("dispatches event even when localStorage.setItem throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    const { setViewMode } = await importViewMode();
    const dispatched: Event[] = [];
    mockWin.addEventListener("viewmodechange", (e) => dispatched.push(e));
    expect(() => setViewMode("cook")).not.toThrow();
    expect(dispatched).toHaveLength(1);
  });
});

describe("toggleViewMode", () => {
  test("flips 'default' to 'cook' and returns 'cook'", async () => {
    const { toggleViewMode } = await importViewMode();
    const result = toggleViewMode();
    expect(result).toBe("cook");
    expect(mockStorage.store["spicemixer.viewMode"]).toBe("cook");
  });

  test("flips 'cook' to 'default' and returns 'default'", async () => {
    mockStorage.store["spicemixer.viewMode"] = "cook";
    const { toggleViewMode } = await importViewMode();
    const result = toggleViewMode();
    expect(result).toBe("default");
    expect(mockStorage.store["spicemixer.viewMode"]).toBe("default");
  });
});

describe("subscribeViewMode", () => {
  test("fires callback immediately with current mode", async () => {
    mockStorage.store["spicemixer.viewMode"] = "cook";
    const { subscribeViewMode } = await importViewMode();
    const calls: string[] = [];
    subscribeViewMode((mode: string) => calls.push(mode));
    expect(calls).toEqual(["cook"]);
  });

  test("fires callback when viewmodechange event fires", async () => {
    const { subscribeViewMode, setViewMode } = await importViewMode();
    const calls: string[] = [];
    subscribeViewMode((mode: string) => calls.push(mode));
    setViewMode("cook");
    expect(calls).toEqual(["default", "cook"]);
  });

  test("returns unsubscribe function that stops further callbacks", async () => {
    const { subscribeViewMode, setViewMode } = await importViewMode();
    const calls: string[] = [];
    const unsub = subscribeViewMode((mode: string) => calls.push(mode));
    unsub();
    setViewMode("cook");
    expect(calls).toEqual(["default"]);
  });

  test("multiple subscribers each receive events independently", async () => {
    const { subscribeViewMode, setViewMode } = await importViewMode();
    const a: string[] = [];
    const b: string[] = [];
    subscribeViewMode((m: string) => a.push(m));
    subscribeViewMode((m: string) => b.push(m));
    setViewMode("cook");
    expect(a).toEqual(["default", "cook"]);
    expect(b).toEqual(["default", "cook"]);
  });
});
