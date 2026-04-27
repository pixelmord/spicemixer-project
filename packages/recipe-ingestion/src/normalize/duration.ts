import { parseDuration } from "../util/duration-parse.ts";
import type { IngestWarning } from "../types.ts";

export function normalizeDuration(
  raw: unknown,
  field: string,
  warnings: IngestWarning[],
): string | undefined {
  if (!raw) return undefined;

  let value: string | undefined;
  if (typeof raw === "string") {
    value = raw;
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    // Some sites embed { maxValue: "PT1H" } for duration ranges
    const v = o["maxValue"] ?? o["value"];
    if (typeof v === "string" || typeof v === "number") value = String(v);
  }

  if (!value) return undefined;

  const parsed = parseDuration(value);
  if (!parsed) {
    warnings.push({
      code: "INVALID_DURATION",
      field,
      message: `Could not parse duration: ${value}`,
    });
    return undefined;
  }

  return parsed;
}
