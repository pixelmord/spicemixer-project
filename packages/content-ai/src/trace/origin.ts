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

const als = new AsyncLocalStorage<Origin>();

export function runWithOrigin<T>(origin: Origin, fn: () => T | PromiseLike<T>): Promise<T> {
  return Promise.resolve(als.run(origin, fn));
}

export function getCurrentOrigin(): Origin | undefined {
  return als.getStore();
}

export type OriginConfig = Omit<Origin, "runId"> & { runId?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withOrigin(
  config: OriginConfig,
): <H extends (...a: any[]) => Promise<any>>(handler: H) => H {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <H extends (...a: any[]) => Promise<any>>(handler: H): H => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((...args: any[]) => {
      const origin: Origin = {
        ...config,
        runId: config.runId ?? crypto.randomUUID(),
      };
      return runWithOrigin(origin, () => handler(...args) as Promise<unknown>);
    }) as H;
  };
}
