import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, FileText, Image } from "lucide-react";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";

export type SourceMode = "file" | "text" | "prompt";

export interface FileSource {
  kind: "file";
  file: File;
  mimeType: string;
}
export interface TextSource {
  kind: "text";
  content: string;
}
export interface PromptSource {
  kind: "prompt";
  prompt: string;
}
export type Source = FileSource | TextSource | PromptSource;

interface Props {
  mode: SourceMode;
  onChange: (source: Source | null) => void;
  showPrompt?: boolean;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
];

export default function SourcePicker({ mode, onChange, showPrompt = true }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && !ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Unsupported file type. Use PDF, image, or a .md/.txt text file.");
      return;
    }
    setFile(f);
    onChange(f ? { kind: "file", file: f, mimeType: f.type } : null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0] ?? null;
    if (f && !ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Unsupported file type. Use PDF, image, or a .md/.txt text file.");
      return;
    }
    setFile(f);
    onChange(f ? { kind: "file", file: f, mimeType: f.type } : null);
  }

  const isText = file?.type === "text/plain" || file?.type === "text/markdown";
  const fileIcon = file ? (
    file.type === "application/pdf" || isText ? (
      <FileText size={16} className="text-muted-foreground" />
    ) : (
      <Image size={16} className="text-muted-foreground" />
    )
  ) : null;

  if (mode === "file") {
    return (
      <div className="space-y-2">
        <Label>File</Label>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          {file ? (
            <div className="flex items-center justify-center gap-2">
              {fileIcon}
              <span className="text-sm font-medium">{file.name}</span>
              <Badge variant="secondary">{(file.size / 1024).toFixed(0)} KB</Badge>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload size={24} className="mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drop a file here, or click to browse</p>
              <p className="text-xs text-muted-foreground">
                PDF, JPEG, PNG, WebP · or .md / .txt text files · max 10 MB
              </p>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*,.md,.txt,text/plain,text/markdown"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  if (mode === "text") {
    return (
      <div className="space-y-2">
        <Label>Paste text or markdown</Label>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value.trim() ? { kind: "text", content: e.target.value } : null);
          }}
          placeholder={`# My Recipe\n\n## Ingredients\n- 2 cups flour\n...\n\n## Instructions\n1. Mix...`}
          className="min-h-48 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Paste any text — markdown, recipe notes, or plain text.
        </p>
      </div>
    );
  }

  // prompt mode
  return (
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
        Describe what you want and the AI will draft the full recipe.
      </p>
    </div>
  );
}
