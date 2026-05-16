export type FieldWritePolicy<T = unknown> =
  | "preserve"
  | "replace"
  | "fill-if-empty"
  | { mode: "merge-function"; merge: (current: T, proposed: T) => T }
  | { mode: "merge-instructions"; instruction: string };

export type FieldSuggestion<T = unknown> =
  | {
      kind: "single";
      value: T;
      confidence: "high" | "medium" | "low";
      summary: string;
      hash: string;
      traceId: string;
    }
  | {
      kind: "choice";
      candidates: Array<{
        value: T;
        summary: string;
        hash: string;
        confidence?: "high" | "medium" | "low";
      }>;
      choose: 1 | { min: number; max: number };
      traceId: string;
    };

export interface AppliedSuggestion {
  value: unknown;
  hash: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

export interface TraceSummary {
  traceId: string;
  model: string;
  runtimeMs: number;
  preset?: string;
  userPrompt?: string;
  confidence?: "high" | "medium" | "low";
}
