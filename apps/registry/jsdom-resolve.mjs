const JSDOM_PATH = "file:///home/agent/workspace/apps/registry/node_modules/jsdom/lib/api.js";
const VIRTUAL_URL = "file:///jsdom-virtual-shim.mjs";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "jsdom") {
    return { shortCircuit: true, url: VIRTUAL_URL };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === VIRTUAL_URL) {
    return {
      format: "module",
      shortCircuit: true,
      source: `
import _api from "${JSDOM_PATH}";
export const JSDOM = _api.JSDOM;
export const VirtualConsole = _api.VirtualConsole;
export const CookieJar = _api.CookieJar;
export const ResourceLoader = _api.ResourceLoader;
export const toughCookie = _api.toughCookie;
export default _api;
`,
    };
  }
  return nextLoad(url, context);
}
