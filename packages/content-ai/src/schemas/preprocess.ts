/**
 * Some smaller models (notably gpt-4o-mini) occasionally echo the JSON Schema
 * descriptor instead of an instance — i.e. they emit
 *   { "type": "object", "properties": <DATA> }
 * when they should have emitted just <DATA>. The actual content under
 * `properties` is correct; only the wrapper is wrong.
 *
 * Use this preprocessor on the top-level Zod schema of any structured-output
 * call so that wrapped responses are silently unwrapped before validation.
 *
 * It is conservative: it only unwraps when the input has the exact shape
 * { type: "object", properties: <object> } and `properties` looks like a
 * non-array object — none of our extract schemas use a top-level field named
 * "type" or "properties", so this is safe for them.
 */
export function unwrapSchemaShaped(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const obj = input as Record<string, unknown>;
  if (obj["type"] !== "object") return input;
  const properties = obj["properties"];
  if (!isPlainObject(properties)) return input;
  return properties;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
