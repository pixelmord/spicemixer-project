import { useState } from "react";
import { cn } from "../lib/utils";
import { FileInput } from "./file-input";
import { TextAreaSource } from "./text-area-source";
import { PromptInputSource } from "./prompt-input-source";

export type SourceShape =
  | { kind: "file"; file: File; mimeType: string }
  | { kind: "text"; content: string }
  | { kind: "prompt"; prompt: string };

export type SourceKind = "file" | "text" | "prompt";

const TABS: Array<{ id: SourceKind; label: string }> = [
  { id: "file", label: "From file" },
  { id: "text", label: "From text" },
  { id: "prompt", label: "From prompt" },
];

const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
];

interface FileTextPromptSourcePickerProps {
  onChange: (source: SourceShape | null) => void;
  className?: string;
}

export function FileTextPromptSourcePicker({
  onChange,
  className,
}: FileTextPromptSourcePickerProps) {
  const [activeTab, setActiveTab] = useState<SourceKind>("file");
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState("");
  // file input is uncontrolled; we reset via key
  const [fileKey, setFileKey] = useState(0);

  function handleTabChange(tab: SourceKind) {
    setActiveTab(tab);
    onChange(null);
    if (tab === "file") setFileKey((k) => k + 1);
  }

  function handleFileChange(file: File | null) {
    if (!file) {
      onChange(null);
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      onChange(null);
      return;
    }
    onChange({ kind: "file", file, mimeType: file.type });
  }

  function handleTextChange(value: string) {
    setText(value);
    onChange(value.trim() ? { kind: "text", content: value } : null);
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    onChange(value.trim() ? { kind: "prompt", prompt: value } : null);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "file" && (
        <FileInput
          key={fileKey}
          accept=".pdf,image/*,.md,.txt,text/plain,text/markdown"
          onChange={handleFileChange}
          label="Upload file"
          hint="PDF, JPEG, PNG, WebP · or .md / .txt text files · max 10 MB"
        />
      )}

      {activeTab === "text" && (
        <TextAreaSource
          value={text}
          onChange={handleTextChange}
          label="Paste text or markdown"
          placeholder={`# My Content\n\nPaste any text — markdown, notes, or plain text.`}
        />
      )}

      {activeTab === "prompt" && (
        <PromptInputSource
          value={prompt}
          onChange={handlePromptChange}
          label="Prompt"
          placeholder="Describe what you want the AI to generate…"
        />
      )}
    </div>
  );
}
