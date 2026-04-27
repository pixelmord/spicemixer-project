import { defineMiddleware } from "astro:middleware";

const LOCALHOST = new Set(["localhost", "127.0.0.1", "::1"]);
const PROTECTED = /^\/(admin|_actions)(\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  if (PROTECTED.test(context.url.pathname)) {
    const hostname = context.url.hostname;
    if (!LOCALHOST.has(hostname)) {
      return new Response("Not Found", { status: 404 });
    }
  }
  return next();
});
