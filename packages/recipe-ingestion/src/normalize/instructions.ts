// Ported from recipe_scrapers/_schemaorg.py:272-327 (HowToStep/HowToSection recursion)
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

import { asStr, normalizeString } from "../util/strings.ts";

type HowToStep = {
  "@type": "HowToStep";
  text: string;
  name?: string;
  url?: string;
};

function extractSteps(item: unknown): HowToStep[] {
  if (typeof item === "string") {
    const text = normalizeString(item);
    return text ? [{ "@type": "HowToStep", text }] : [];
  }

  if (!item || typeof item !== "object") return [];
  const o = item as Record<string, unknown>;
  const type = o["@type"];

  if (type === "HowToStep" || type === "Step") {
    const text = normalizeString(asStr(o["text"]) || asStr(o["name"]));
    if (!text) return [];
    const rawName = o["name"] ? normalizeString(asStr(o["name"])) : undefined;
    // Only include name if it differs from the opening of text
    const name = rawName && rawName !== text && !text.startsWith(rawName) ? rawName : undefined;
    const url = typeof o["url"] === "string" ? o["url"] : undefined;
    const step: HowToStep = { "@type": "HowToStep", text };
    if (name) step.name = name;
    if (url) step.url = url;
    return [step];
  }

  if (type === "HowToSection") {
    const children = o["itemListElement"];
    if (Array.isArray(children)) {
      return children.flatMap((child) => extractSteps(child));
    }
    return [];
  }

  const text = normalizeString(asStr(o["text"]) || asStr(o["name"]));
  return text ? [{ "@type": "HowToStep", text }] : [];
}

export function normalizeInstructions(raw: unknown): HowToStep[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.flatMap((item) => extractSteps(item));
}
