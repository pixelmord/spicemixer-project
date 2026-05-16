import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(__dirname, "jsdom-resolve.mjs")).href, pathToFileURL(__dirname + "/"));
