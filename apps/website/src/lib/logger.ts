import pino, { type Logger as PinoLogger } from "pino";
import type { Logger } from "@pixelmord/content-ai-core";

/**
 * Server-side logger. Pretty-prints in dev, structured JSON in prod.
 * The pino Logger shape satisfies our content-ai-core Logger interface
 * structurally — pass instances directly to runRefine/runFill.
 */
function createPino(): PinoLogger {
  const isDev = process.env["NODE_ENV"] !== "production";
  const level = process.env["LOG_LEVEL"] ?? (isDev ? "debug" : "info");

  if (isDev) {
    return pino({
      level,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
      },
    });
  }
  return pino({ level });
}

export const logger: PinoLogger = createPino();

/** Narrow pino's logger to the content-ai-core Logger interface for type-safe handoff. */
export const aiLogger: Logger = logger as unknown as Logger;
