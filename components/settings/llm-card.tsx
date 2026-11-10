"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

interface LlmCardProps {
  advanced?: boolean;
}

// Thẻ cấu hình Trợ lý AI gọi trực tiếp nhà cung cấp OpenAI-compatible (mặc định xAI).
export function LlmCard({ advanced = false }: LlmCardProps) {
  const { data, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const [syncedData, setSyncedData] = useState<typeof data>(undefined);
  if (data !== syncedData) {
    setSyncedData(data);
    if (data) {
      setBaseUrl(data.llmBaseUrl ?? "");
      setApiKey("");
      setModel(data.llmModel ?? "");
      setSystemPrompt(data.llmSystemPrompt ?? "");
    }
  }

  const hasUnsavedChanges =
    Boolean(data) &&
    (baseUrl !== (data!.llmBaseUrl ?? "") ||
      Boolean(apiKey) ||
      model !== (data!.llmModel ?? "") ||
      systemPrompt !== (data!.llmSystemPrompt ?? ""));

  function handleSave() {
    updateMutation.mutate(
      {
        llmBaseUrl: baseUrl || null,
        llmApiKey: apiKey || undefined,
        llmModel: model || null,
        llmSystemPrompt: systemPrompt || null,
      },
      {
        onSuccess: () => {
          setApiKey("");
          toast.success("Đã lưu cấu hình Trợ lý AI");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Lưu thất bại"),
      },
    );
  }

  function handleClearKey() {
    setApiKey("");
    updateMutation.mutate(
      { llmApiKey: null },
      {
        onSuccess: () => {
          toast.success("Đã xóa API key Trợ lý AI");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Xóa thất bại"),
      },
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trợ lý AI (chế độ tạo ảnh bằng mô tả)</CardTitle>
        <CardDescription>
          Kết nối trực tiếp tới nhà cung cấp LLM để tự động viết mô tả và ý tưởng cho từng ảnh.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-1.5 text-xs">
          {data?.hasLlmKey ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-700">Sẵn sàng</span>
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              <span className="text-red-700">Chưa có API key — Trợ lý AI chưa dùng được</span>
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-api-key">API key nhà cung cấp LLM</Label>
          <Input
            id="llm-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={data?.hasLlmKey ? "Đã lưu — để trống nếu không đổi" : "xai-..."}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-base-url">Base URL</Label>
          <Input
            id="llm-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.x.ai/v1"
          />
          <p className="text-xs text-muted-foreground">
            Để trống = xAI mặc định. Dùng được mọi API tương thích OpenAI.
          </p>
        </div>

        {advanced && (
          <>
            <div className="space-y-2">
              <Label htmlFor="llm-model">Model (tùy chọn)</Label>
              <Input
                id="llm-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="grok-4-fast-non-reasoning"
              />
              <p className="text-xs text-muted-foreground">
                Để trống để dùng model mặc định (grok-4-fast-non-reasoning).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="llm-system-prompt">System prompt tùy chỉnh (tùy chọn)</Label>
              <Textarea
                id="llm-system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Để trống để dùng system prompt mặc định của Anima Studio."
                className="min-h-32"
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasUnsavedChanges && <Badge variant="destructive">Có thay đổi chưa lưu</Badge>}
          <Button
            variant="ghost"
            onClick={handleClearKey}
            disabled={updateMutation.isPending || !data?.hasLlmKey}
          >
            Xóa API key
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || !hasUnsavedChanges}>
            {updateMutation.isPending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
