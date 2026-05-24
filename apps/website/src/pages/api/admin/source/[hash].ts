import type { APIRoute } from "astro";
import { createSourceStore } from "@/lib/stores/source-store.ts";

export const prerender = false;

const HASH_RE = /^[0-9a-f]{64}$/;

export const GET: APIRoute = async ({ params }) => {
  const hash = params["hash"];
  if (!hash || !HASH_RE.test(hash)) {
    return new Response("Invalid hash", { status: 400 });
  }

  const store = createSourceStore();
  const bytes = await store.readBinary(hash);
  if (!bytes) {
    return new Response("Source artifact not found", { status: 404 });
  }

  const meta = await store.getBinaryMeta(hash);
  const mime = meta?.mime ?? "application/octet-stream";
  const rawFilename = meta?.filename ?? `source-${hash.slice(0, 12)}`;
  // eslint-disable-next-line no-control-regex
  const filename = rawFilename.replace(/[\x00-\x1f"]/g, "");

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
};
