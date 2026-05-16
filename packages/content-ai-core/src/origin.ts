import { AsyncLocalStorage } from "node:async_hooks";

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

export const originContext = new AsyncLocalStorage<Origin>();

export function withOrigin<T>(origin: Origin, fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(originContext.run(origin, fn));
}

export type OriginConfig = Omit<Origin, "runId"> & { runId?: string };

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

export function getCurrentOrigin(): Origin | undefined {
  return originContext.getStore();
}
