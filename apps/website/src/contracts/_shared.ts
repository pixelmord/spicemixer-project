// Shared building blocks for the per-kind AI contracts. Kept here so preset
// defaults and the existing-values rule live in one place instead of being
// pasted into each contract. Anything genuinely kind-specific (context
// builders, system-prompt preambles, output schemas) stays in its contract.

// Text presets common to the recipe and ingredient contracts. The pairing
// contract defines its own (tailored expand + tone/research), so it does not
// consume these.
export const commonPresets = [
  {
    id: "expand",
    label: "Expand",
    description: "Expand the content with more detail.",
    instruction: "Write in more detail, adding depth and nuance.",
    appliesTo: "text" as const,
    autoApplyOverride: { policy: "never" as const },
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Shorten the content.",
    instruction: "Write a concise version without losing key points.",
    appliesTo: "text" as const,
    autoApplyOverride: { policy: "never" as const },
  },
];

// Rule reused across string[] fields so suggestions don't echo back values the
// user has already accepted. Without this the model treats existing items as
// context and parrots them back verbatim.
export function excludeExistingValuesRule(existing: string[] | undefined): string {
  if (!existing?.length) return "";
  return `Existing values already on the entity: ${existing.join(", ")}.
You MUST NOT include any of these in your output — they are already accepted.
Return ONLY genuinely new values. If you have nothing new to add, return an empty array [].`;
}
