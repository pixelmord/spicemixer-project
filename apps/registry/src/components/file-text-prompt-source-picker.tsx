import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileInput } from "./file-input";
import { TextAreaSource } from "./text-area-source";
import { PromptInputSource } from "./prompt-input-source";

// ── Types ──────────────────────────────────────────────────────────────────────

export type IngestSource =
  | { kind: "file"; file: File }
  | { kind: "text"; text: string }
  | { kind: "prompt"; prompt: string };

type TabId = "file" | "text" | "prompt";

interface FileTextPromptSourcePickerProps {
  value: IngestSource | null;
  onChange: (source: IngestSource | null) => void;
  className?: string;
}

const TAB_LABELS: Record<TabId, string> = {
  file: "File",
  text: "Text",
  prompt: "Prompt",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function FileTextPromptSourcePicker({
  value,
  onChange,
  className,
}: FileTextPromptSourcePickerProps) {
  const [activeTab, setActiveTab] = useState<TabId>(value ? (value.kind as TabId) : "file");
  const [text, setText] = useState<string>(value?.kind === "text" ? value.text : "");
  const [prompt, setPrompt] = useState<string>(value?.kind === "prompt" ? value.prompt : "");

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    onChange(null);
  }

  function handleFileChange(file: File | null) {
    onChange(file ? { kind: "file", file } : null);
  }

  function handleTextChange(t: string) {
    setText(t);
    onChange(t ? { kind: "text", text: t } : null);
  }

  function handlePromptChange(p: string) {
    setPrompt(p);
    onChange(p ? { kind: "prompt", prompt: p } : null);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div role="tablist" aria-label="Source type" className="flex border-b border-border">
        {(["file", "text", "prompt"] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`source-panel-${tab}`}
            id={`source-tab-${tab}`}
            onClick={() => handleTabChange(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`source-panel-${activeTab}`}
        aria-labelledby={`source-tab-${activeTab}`}
      >
        {activeTab === "file" && (
          <FileInput onChange={handleFileChange} accept=".pdf,.txt,.md" hint=".pdf, .txt, or .md" />
        )}
        {activeTab === "text" && <TextAreaSource value={text} onChange={handleTextChange} />}
        {activeTab === "prompt" && (
          <PromptInputSource value={prompt} onChange={handlePromptChange} />
        )}
      </div>
    </div>
  );
}
