import { describe, expect, test, beforeEach } from "vite-plus/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, rm, stat } from "node:fs/promises";
import { LocalSourceStore } from "../src/source-store/local.ts";
import { hashBinary } from "../src/source-store/ids.ts";
import {
  binaryMetaSchema,
  textMetaSchema,
  structuredMetaSchema,
} from "../src/source-store/types.ts";
import { InMemorySourceStore } from "../src/source-store/in-memory.ts";
import type { SourceStore } from "../src/source-store/index.ts";

// ─── hashBinary ───────────────────────────────────────────────────────────────

describe("hashBinary — determinism", () => {
  const bytes = new TextEncoder().encode("hello world");

  test("same bytes produce the same hash", () => {
    expect(hashBinary(bytes)).toBe(hashBinary(bytes));
  });

  test("same bytes produce the same hash across two calls", () => {
    const b1 = new TextEncoder().encode("recipe pdf content");
    const b2 = new TextEncoder().encode("recipe pdf content");
    expect(hashBinary(b1)).toBe(hashBinary(b2));
  });

  test("different bytes produce different hashes", () => {
    const a = new TextEncoder().encode("content A");
    const b = new TextEncoder().encode("content B");
    expect(hashBinary(a)).not.toBe(hashBinary(b));
  });

  test("returns 64-char lowercase hex string (sha256)", () => {
    expect(hashBinary(bytes)).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── LocalSourceStore ────────────────────────────────────────────────────────

function makeStore(dir: string) {
  return new LocalSourceStore(dir);
}

const BINARY_META = {
  kind: "pdf" as const,
  mime: "application/pdf",
  sizeBytes: 512,
  filename: "recipe.pdf",
  uploadedAt: "2026-05-08T12:00:00.000Z",
};

const TEXT_META_PARTIAL = {
  charCount: 200,
  pageCount: 3,
  extractedAt: "2026-05-08T12:01:00.000Z",
};

const STRUCTURED_META_PARTIAL = {
  capability: "aiExtractRecipe",
  model: "gpt-4o-mini",
  at: "2026-05-08T12:02:00.000Z",
};

describe("LocalSourceStore — putBinary", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `source-store-test-${crypto.randomUUID()}`);
  });

  test("returns binaryHash matching hashBinary of the same bytes", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("some pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    expect(binaryHash).toBe(hashBinary(bytes));
    await rm(dir, { recursive: true, force: true });
  });

  test("writes binary file at expected path", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("binary content");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const filePath = join(dir, binaryHash, "source.pdf");
    const content = await readFile(filePath);
    expect(content).toEqual(Buffer.from(bytes));
    await rm(dir, { recursive: true, force: true });
  });

  test("writes source.meta.json with valid BinaryMeta", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("binary content");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const metaPath = join(dir, binaryHash, "source.meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    const parsed = binaryMetaSchema.safeParse(meta);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.kind).toBe("pdf");
    expect(parsed.success && parsed.data.mime).toBe("application/pdf");
    await rm(dir, { recursive: true, force: true });
  });

  test("idempotent — identical bytes do not create duplicate files", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("identical content");
    const r1 = await store.putBinary(bytes, BINARY_META);
    const r2 = await store.putBinary(bytes, BINARY_META);
    expect(r1.binaryHash).toBe(r2.binaryHash);
    // Only one binary file exists
    const filePath = join(dir, r1.binaryHash, "source.pdf");
    const s = await stat(filePath);
    expect(s.isFile()).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  test("uses .txt extension for text/plain mime", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("text content");
    const { binaryHash } = await store.putBinary(bytes, {
      kind: "text",
      mime: "text/plain",
      sizeBytes: bytes.length,
      uploadedAt: "2026-05-08T12:00:00.000Z",
    });
    const filePath = join(dir, binaryHash, "source.txt");
    const s = await stat(filePath);
    expect(s.isFile()).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("LocalSourceStore — putText", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `source-store-test-${crypto.randomUUID()}`);
  });

  test("writes text file at text/<strategy>-<version>.txt", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    await store.putText(binaryHash, "pdfjs", "5", "extracted text content", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    const textPath = join(dir, binaryHash, "text", "pdfjs-5.txt");
    const content = await readFile(textPath, "utf8");
    expect(content).toBe("extracted text content");
    await rm(dir, { recursive: true, force: true });
  });

  test("writes text/<strategy>-<version>.meta.json with valid TextMeta", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    await store.putText(binaryHash, "pdfjs", "5", "extracted text", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    const metaPath = join(dir, binaryHash, "text", "pdfjs-5.meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    const parsed = textMetaSchema.safeParse(meta);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.strategy).toBe("pdfjs");
    expect(parsed.success && parsed.data.version).toBe("5");
    expect(parsed.success && parsed.data.parentBinaryHash).toBe(binaryHash);
    await rm(dir, { recursive: true, force: true });
  });

  test("idempotent — same strategy+version overwrites (no duplicate)", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    await store.putText(binaryHash, "pdfjs", "5", "first extraction", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    await store.putText(binaryHash, "pdfjs", "5", "second extraction", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    const textPath = join(dir, binaryHash, "text", "pdfjs-5.txt");
    const content = await readFile(textPath, "utf8");
    // Last write wins — no duplicate files
    expect(content).toBe("second extraction");
    await rm(dir, { recursive: true, force: true });
  });

  test("different versions coexist for same strategy", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    await store.putText(binaryHash, "pdfjs", "4", "old text", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    await store.putText(binaryHash, "pdfjs", "5", "new text", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    const old = await readFile(join(dir, binaryHash, "text", "pdfjs-4.txt"), "utf8");
    const newer = await readFile(join(dir, binaryHash, "text", "pdfjs-5.txt"), "utf8");
    expect(old).toBe("old text");
    expect(newer).toBe("new text");
    await rm(dir, { recursive: true, force: true });
  });
});

describe("LocalSourceStore — putStructured", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `source-store-test-${crypto.randomUUID()}`);
  });

  test("writes structured/<traceId>.json with the data", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const traceId = crypto.randomUUID();
    const data = { name: "Pasta", recipeIngredient: ["100g pasta"] };
    await store.putStructured(binaryHash, traceId, data, {
      ...STRUCTURED_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    const jsonPath = join(dir, binaryHash, "structured", `${traceId}.json`);
    const content = JSON.parse(await readFile(jsonPath, "utf8"));
    expect(content.name).toBe("Pasta");
    await rm(dir, { recursive: true, force: true });
  });

  test("writes structured/<traceId>.meta.json with valid StructuredMeta", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const traceId = crypto.randomUUID();
    await store.putStructured(
      binaryHash,
      traceId,
      { name: "Test" },
      {
        ...STRUCTURED_META_PARTIAL,
        parentBinaryHash: binaryHash,
      },
    );
    const metaPath = join(dir, binaryHash, "structured", `${traceId}.meta.json`);
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    const parsed = structuredMetaSchema.safeParse(meta);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.traceId).toBe(traceId);
    expect(parsed.success && parsed.data.parentBinaryHash).toBe(binaryHash);
    await rm(dir, { recursive: true, force: true });
  });

  test("multiple traceIds coexist for same binary", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("pdf bytes");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const t1 = "trace-1";
    const t2 = "trace-2";
    await store.putStructured(
      binaryHash,
      t1,
      { attempt: 1 },
      {
        ...STRUCTURED_META_PARTIAL,
        parentBinaryHash: binaryHash,
      },
    );
    await store.putStructured(
      binaryHash,
      t2,
      { attempt: 2 },
      {
        ...STRUCTURED_META_PARTIAL,
        parentBinaryHash: binaryHash,
      },
    );
    const d1 = JSON.parse(
      await readFile(join(dir, binaryHash, "structured", `${t1}.json`), "utf8"),
    );
    const d2 = JSON.parse(
      await readFile(join(dir, binaryHash, "structured", `${t2}.json`), "utf8"),
    );
    expect(d1.attempt).toBe(1);
    expect(d2.attempt).toBe(2);
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── readBinary ──────────────────────────────────────────────────────────────

describe("LocalSourceStore — readBinary", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `source-store-test-${crypto.randomUUID()}`);
  });

  test("returns stored bytes for known hash", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("read me back");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const read = await store.readBinary(binaryHash);
    expect(read).not.toBeNull();
    expect(Array.from(read!)).toEqual(Array.from(bytes));
    await rm(dir, { recursive: true, force: true });
  });

  test("returns null for unknown hash", async () => {
    const store = makeStore(dir);
    const result = await store.readBinary("0".repeat(64));
    expect(result).toBeNull();
  });
});

// ─── listForBinary ────────────────────────────────────────────────────────────

describe("LocalSourceStore — listForBinary", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `source-store-test-${crypto.randomUUID()}`);
  });

  test("returns empty lists when no text or structured artifacts", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("some content");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const result = await store.listForBinary(binaryHash);
    expect(result.texts).toEqual([]);
    expect(result.structured).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  test("lists text artifact filenames without extension", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("content");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    await store.putText(binaryHash, "pdfjs", "5", "text", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    await store.putText(binaryHash, "direct", "1", "text2", {
      ...TEXT_META_PARTIAL,
      parentBinaryHash: binaryHash,
    });
    const result = await store.listForBinary(binaryHash);
    expect(result.texts).toContain("pdfjs-5");
    expect(result.texts).toContain("direct-1");
    await rm(dir, { recursive: true, force: true });
  });

  test("lists structured artifact traceIds", async () => {
    const store = makeStore(dir);
    const bytes = new TextEncoder().encode("content");
    const { binaryHash } = await store.putBinary(bytes, BINARY_META);
    const t1 = "trace-aaa";
    const t2 = "trace-bbb";
    await store.putStructured(
      binaryHash,
      t1,
      {},
      { ...STRUCTURED_META_PARTIAL, parentBinaryHash: binaryHash },
    );
    await store.putStructured(
      binaryHash,
      t2,
      {},
      { ...STRUCTURED_META_PARTIAL, parentBinaryHash: binaryHash },
    );
    const result = await store.listForBinary(binaryHash);
    expect(result.structured).toContain(t1);
    expect(result.structured).toContain(t2);
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── three-artifact roundtrip ─────────────────────────────────────────────────

describe("LocalSourceStore — three-artifact roundtrip + lineage", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `source-store-test-${crypto.randomUUID()}`);
  });

  test("binary → text → structured pipeline with lineage meta roundtrip", async () => {
    const store = makeStore(dir);

    // Stage 1: binary
    const pdfBytes = new TextEncoder().encode("a pdf file with content");
    const { binaryHash } = await store.putBinary(pdfBytes, {
      kind: "pdf",
      mime: "application/pdf",
      sizeBytes: pdfBytes.length,
      filename: "source.pdf",
      uploadedAt: "2026-05-08T12:00:00.000Z",
    });

    // Stage 2: extracted text
    const extractedText = "Pasta al Pomodoro\n\n2 cups pasta\n1 can tomatoes";
    await store.putText(binaryHash, "pdfjs", "5", extractedText, {
      charCount: extractedText.length,
      pageCount: 1,
      extractedAt: "2026-05-08T12:01:00.000Z",
      parentBinaryHash: binaryHash,
    });

    // Stage 3: structured output
    const traceId = "lineage-test-trace-id";
    const structuredData = {
      name: "Pasta al Pomodoro",
      recipeIngredient: ["2 cups pasta", "1 can tomatoes"],
    };
    await store.putStructured(binaryHash, traceId, structuredData, {
      capability: "aiExtractRecipe",
      model: "gpt-4o-mini",
      at: "2026-05-08T12:02:00.000Z",
      parentTextHash: "pdfjs-5",
      parentBinaryHash: binaryHash,
    });

    // Verify lineage: read structured meta and follow parent pointers
    const structuredMetaPath = join(dir, binaryHash, "structured", `${traceId}.meta.json`);
    const structuredMeta = JSON.parse(await readFile(structuredMetaPath, "utf8"));
    const parsedStructured = structuredMetaSchema.safeParse(structuredMeta);
    expect(parsedStructured.success).toBe(true);
    expect(parsedStructured.success && parsedStructured.data.parentBinaryHash).toBe(binaryHash);
    expect(parsedStructured.success && parsedStructured.data.parentTextHash).toBe("pdfjs-5");

    // Verify we can read binary back
    const restoredBytes = await store.readBinary(binaryHash);
    expect(restoredBytes).not.toBeNull();
    expect(Array.from(restoredBytes!)).toEqual(Array.from(pdfBytes));

    // Verify listing shows all artifacts
    const listing = await store.listForBinary(binaryHash);
    expect(listing.texts).toContain("pdfjs-5");
    expect(listing.structured).toContain(traceId);

    await rm(dir, { recursive: true, force: true });
  });
});

// ─── InMemorySourceStore + parity tests ───────────────────────────────────────

type StoreFactory = () => { store: SourceStore; cleanup?: () => Promise<void> };

function makeLocalFactory(): StoreFactory {
  return () => {
    const d = join(tmpdir(), `source-store-test-${crypto.randomUUID()}`);
    const store = new LocalSourceStore(d);
    return {
      store,
      cleanup: () => rm(d, { recursive: true, force: true }),
    };
  };
}

function makeInMemoryFactory(): StoreFactory {
  return () => ({ store: new InMemorySourceStore() });
}

const PARITY_CASES: Array<[string, StoreFactory]> = [
  ["LocalSourceStore", makeLocalFactory()],
  ["InMemorySourceStore", makeInMemoryFactory()],
];

for (const [name, factory] of PARITY_CASES) {
  describe(`${name} — parity: put-then-get round-trips`, () => {
    test("getBinaryMeta round-trip", async () => {
      const { store, cleanup } = factory();
      const bytes = new TextEncoder().encode("binary content");
      const { binaryHash } = await store.putBinary(bytes, BINARY_META);
      const meta = await store.getBinaryMeta(binaryHash);
      expect(meta).toBeDefined();
      expect(meta!.mime).toBe(BINARY_META.mime);
      expect(meta!.kind).toBe(BINARY_META.kind);
      expect(meta!.filename).toBe(BINARY_META.filename);
      await cleanup?.();
    });

    test("getBinaryMeta returns undefined for missing hash", async () => {
      const { store, cleanup } = factory();
      const meta = await store.getBinaryMeta("0".repeat(64));
      expect(meta).toBeUndefined();
      await cleanup?.();
    });

    test("getTextArtifact round-trip", async () => {
      const { store, cleanup } = factory();
      const bytes = new TextEncoder().encode("pdf bytes");
      const { binaryHash } = await store.putBinary(bytes, BINARY_META);
      await store.putText(binaryHash, "pdfjs", "5", "hello text", {
        ...TEXT_META_PARTIAL,
        parentBinaryHash: binaryHash,
      });
      const text = await store.getTextArtifact(binaryHash, "pdfjs", "5");
      expect(text).toBe("hello text");
      await cleanup?.();
    });

    test("getTextArtifact returns undefined for missing artifact", async () => {
      const { store, cleanup } = factory();
      const bytes = new TextEncoder().encode("pdf bytes");
      const { binaryHash } = await store.putBinary(bytes, BINARY_META);
      const text = await store.getTextArtifact(binaryHash, "pdfjs", "99");
      expect(text).toBeUndefined();
      await cleanup?.();
    });

    test("getTextArtifact returns undefined for unknown hash", async () => {
      const { store, cleanup } = factory();
      const text = await store.getTextArtifact("0".repeat(64), "pdfjs", "5");
      expect(text).toBeUndefined();
      await cleanup?.();
    });

    test("getStructuredArtifact round-trip", async () => {
      const { store, cleanup } = factory();
      const bytes = new TextEncoder().encode("pdf bytes");
      const { binaryHash } = await store.putBinary(bytes, BINARY_META);
      const traceId = "test-trace-roundtrip";
      const data = { name: "Pasta", recipeIngredient: ["100g pasta"] };
      await store.putStructured(binaryHash, traceId, data, {
        ...STRUCTURED_META_PARTIAL,
        parentBinaryHash: binaryHash,
      });
      const result = await store.getStructuredArtifact(binaryHash, traceId);
      expect(result).toEqual(data);
      await cleanup?.();
    });

    test("getStructuredArtifact returns undefined for missing artifact", async () => {
      const { store, cleanup } = factory();
      const bytes = new TextEncoder().encode("pdf bytes");
      const { binaryHash } = await store.putBinary(bytes, BINARY_META);
      const result = await store.getStructuredArtifact(binaryHash, "no-such-trace");
      expect(result).toBeUndefined();
      await cleanup?.();
    });

    test("getStructuredArtifact returns undefined for unknown hash", async () => {
      const { store, cleanup } = factory();
      const result = await store.getStructuredArtifact("0".repeat(64), "any-trace");
      expect(result).toBeUndefined();
      await cleanup?.();
    });
  });
}
