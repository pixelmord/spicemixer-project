import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ambient provenance for an AI run: which `surface`/`action` triggered it,
 * which entity/field it targets, whether a user initiated it, and the `runId`
 * correlating all LLM calls in the run. Carried through
 * {@link originContext | async-local storage} so {@link tracingMiddleware} can
 * stamp every emitted {@link TraceEvent} without threading it manually.
 *
 * Server-only (`node:async_hooks`).
 */
export interface Origin {
  surface: string;
  action: string;
  entityKind?: string;
  entityRef?: string;
  field?: string;
  userInitiated: boolean;
  runId: string;
  parentRunId?: string;
  triggeredBy: "editor" | "system";
  sourceUrl?: string;
  sourceHash?: string;
}

/** The `AsyncLocalStorage` holding the current {@link Origin} for a run. */
export const originContext = new AsyncLocalStorage<Origin>();

/** Run `fn` with `origin` set as the ambient {@link Origin}, returning its result. */
export function withOrigin<T>(origin: Origin, fn: () => T | PromiseLike<T>): Promise<T> {
  return Promise.resolve(originContext.run(origin, fn));
}

/** {@link Origin} without `runId` — {@link wrapWithOrigin} fills it if omitted. */
export type OriginConfig = Omit<Origin, "runId"> & { runId?: string };

/**
 * Wrap an async handler so every invocation runs inside a fresh {@link Origin}
 * (a generated `runId` unless `config.runId` is given). The returned decorator
 * preserves the handler's signature — use it to attach provenance at a request
 * or action boundary so downstream LLM calls are traced under one run.
 */
export function wrapWithOrigin(
  config: OriginConfig,
): <A extends unknown[], R>(handler: (...a: A) => Promise<R>) => (...a: A) => Promise<R> {
  return <A extends unknown[], R>(handler: (...a: A) => Promise<R>) => {
    return (...args: A): Promise<R> => {
      const origin: Origin = { ...config, runId: config.runId ?? crypto.randomUUID() };
      return withOrigin(origin, () => handler(...args));
    };
  };
}

/** The ambient {@link Origin} for the current run, or `undefined` outside one. */
export function getCurrentOrigin(): Origin | undefined {
  return originContext.getStore();
}
