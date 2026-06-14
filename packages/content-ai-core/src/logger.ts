/** A single log method: accepts a message, or a structured object + message. */
export interface LogFn {
  (msg: string): void;
  (obj: unknown, msg?: string): void;
}

/**
 * Structural logger interface — pino-compatible, no runtime dependency.
 * Consumers pass any logger matching this shape (pino, bunyan, custom); the
 * runners default to {@link noopLogger} when none is supplied.
 */
export interface Logger {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child: (bindings: Record<string, unknown>) => Logger;
}

const noop: LogFn = (() => {}) as LogFn;

/** A {@link Logger} that discards everything. The runners' default. */
export const noopLogger: Logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => noopLogger,
};

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const;
/** Log severity name, ordered `trace` < `debug` < … < `fatal`. */
export type LogLevel = keyof typeof LEVELS;

/**
 * Minimal console-backed logger. Useful for tests, scripts, or as a fallback
 * when the consumer hasn't wired a real logger. Real apps should pass pino.
 */
export function createConsoleLogger(
  level: LogLevel = "info",
  bindings: Record<string, unknown> = {},
): Logger {
  const minLevel = LEVELS[level];
  const fmtBindings = Object.keys(bindings).length ? ` ${JSON.stringify(bindings)}` : "";

  const make = (lvl: LogLevel, sink: (...args: unknown[]) => void): LogFn => {
    const fn: LogFn = ((arg1: unknown, arg2?: string) => {
      if (LEVELS[lvl] < minLevel) return;
      const tag = `[${lvl}]${fmtBindings}`;
      if (typeof arg1 === "string") sink(tag, arg1);
      else if (arg2) sink(tag, arg2, arg1);
      else sink(tag, arg1);
    }) as LogFn;
    return fn;
  };

  const logger: Logger = {
    trace: make("trace", console.debug.bind(console)),
    debug: make("debug", console.debug.bind(console)),
    info: make("info", console.info.bind(console)),
    warn: make("warn", console.warn.bind(console)),
    error: make("error", console.error.bind(console)),
    fatal: make("fatal", console.error.bind(console)),
    child: (childBindings) => createConsoleLogger(level, { ...bindings, ...childBindings }),
  };
  return logger;
}
