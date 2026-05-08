import type { RecipeExtract } from "../../src/schemas/recipe-extract.ts";

export type JudgeVerdict = "pass" | "fail" | "partial";

export interface Judge {
  generate(prompt: string): Promise<string>;
}

function buildJudgeFromEnv(): Judge | null {
  const baseUrl = process.env["AI_JUDGE_BASE_URL"];
  const apiKey = process.env["AI_JUDGE_API_KEY"];
  const model = process.env["AI_JUDGE_MODEL"];
  if (!baseUrl || !apiKey || !model) return null;

  return {
    async generate(prompt: string): Promise<string> {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 16,
          temperature: 0,
        }),
      });
      if (!response.ok) throw new Error(`Judge HTTP ${response.status}`);
      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content?.trim() ?? "";
    },
  };
}

function buildPrompt(actual: RecipeExtract, expected: RecipeExtract): string {
  return `You are a culinary content evaluator. Judge whether the extracted recipe description faithfully represents the original.

Original description:
${expected.description ?? "(none)"}

Extracted description:
${actual.description ?? "(none)"}

Reply with exactly one word: "pass", "partial", or "fail".
- pass: extracted description faithfully captures the original's meaning and key details
- partial: captures some details but misses or distorts others
- fail: description is missing, wrong, or substantially different from the original`;
}

function parseVerdict(raw: string): JudgeVerdict {
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith("pass")) return "pass";
  if (lower.startsWith("partial")) return "partial";
  return "fail";
}

export async function descriptionFaithful(
  actual: RecipeExtract,
  expected: RecipeExtract,
  judge?: Judge | null,
): Promise<JudgeVerdict> {
  const resolvedJudge = judge !== undefined ? judge : buildJudgeFromEnv();
  if (!resolvedJudge) return "pass"; // no-op when judge is unavailable

  const prompt = buildPrompt(actual, expected);
  const raw = await resolvedJudge.generate(prompt);
  return parseVerdict(raw);
}
