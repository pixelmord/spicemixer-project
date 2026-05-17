import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, Image } from "lucide-react";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

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

const ACCEPTED_TYPES = [
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
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState("");

  function handleTabChange(tab: SourceKind) {
    setActiveTab(tab);
    setFile(null);
    onChange(null);
  }

  function acceptFile(f: File | null) {
    if (f && !ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Unsupported file type. Use PDF, image, or a .md/.txt text file.");
      return;
    }
    setFile(f);
    onChange(f ? { kind: "file", file: f, mimeType: f.type } : null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    acceptFile(e.dataTransfer.files[0] ?? null);
  }

  function fileIcon() {
    if (!file) return null;
    const isDocument =
      file.type === "application/pdf" ||
      file.type === "text/plain" ||
      file.type === "text/markdown";
    const Icon = isDocument ? FileText : Image;
    return <Icon size={16} className="text-muted-foreground" />;
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
        <div className="space-y-2">
          <Label>File</Label>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("ftps-file-input")?.click()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                {fileIcon()}
                <span className="text-sm font-medium">{file.name}</span>
                <Badge variant="secondary">{(file.size / 1024).toFixed(0)} KB</Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload size={24} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop a file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, JPEG, PNG, WebP · or .md / .txt text files · max 10 MB
                </p>
              </div>
            )}
          </div>
          <input
            id="ftps-file-input"
            type="file"
            accept=".pdf,image/*,.md,.txt,text/plain,text/markdown"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {activeTab === "text" && (
        <div className="space-y-2">
          <Label>Paste text or markdown</Label>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onChange(e.target.value.trim() ? { kind: "text", content: e.target.value } : null);
            }}
            placeholder={`# My Content\n\nPaste any text — markdown, notes, or plain text.`}
            className="min-h-48 font-mono text-xs"
          />
        </div>
      )}

      {activeTab === "prompt" && (
        <div className="space-y-2">
          <Label>Prompt</Label>
          <Input
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              onChange(e.target.value.trim() ? { kind: "prompt", prompt: e.target.value } : null);
            }}
            placeholder="e.g. Quick weeknight Thai green curry, vegetarian, serves 4"
          />
          <p className="text-xs text-muted-foreground">
            Describe what you want and the AI will draft the full content.
          </p>
        </div>
      )}
    </div>
  );
}
