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

export function LlmCard() {
  const { data, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState({
    llmBaseUrl: "",
    llmModel: "",
    llmSystemPrompt: "",
    llmApiKey: "",
  });

  const [syncedData, setSyncedData] = useState<typeof data>(undefined);
  if (data !== syncedData) {
    setSyncedData(data);
    if (data) {
      setForm((f) => ({
        ...f,
        llmBaseUrl: data.llmBaseUrl ?? "",
        llmModel: data.llmModel ?? "",
        llmSystemPrompt: data.llmSystemPrompt ?? "",
      }));
    }
  }

  const hasUnsavedChanges =
    Boolean(data) &&
    (form.llmBaseUrl !== (data!.llmBaseUrl ?? "") ||
      form.llmModel !== (data!.llmModel ?? "") ||
      form.llmSystemPrompt !== (data!.llmSystemPrompt ?? "") ||
      form.llmApiKey !== "");

  function handleSave() {
    updateMutation.mutate(
      {
        llmBaseUrl: form.llmBaseUrl || null,
        llmModel: form.llmModel || null,
        llmSystemPrompt: form.llmSystemPrompt || null,
        ...(form.llmApiKey ? { llmApiKey: form.llmApiKey } : {}),
      },
      {
        onSuccess: () => {
          setForm((f) => ({ ...f, llmApiKey: "" }));
          toast.success("Đã lưu cấu hình Trợ lý AI");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Lưu thất bại"),
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
          Dùng một LLM theo chuẩn OpenAI (OpenAI, OpenRouter, Groq, hoặc server local như Ollama/LM Studio) để tự
          viết yêu cầu chi tiết cho từng ảnh.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="llm-base-url">Base URL (chuẩn OpenAI Chat Completions)</Label>
            <Input
              id="llm-base-url"
              value={form.llmBaseUrl}
              onChange={(e) => setForm((f) => ({ ...f, llmBaseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llm-model">Model</Label>
            <Input
              id="llm-model"
              value={form.llmModel}
              onChange={(e) => setForm((f) => ({ ...f, llmModel: e.target.value }))}
              placeholder="gpt-4o-mini"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-api-key">API key</Label>
          <Input
            id="llm-api-key"
            type="password"
            value={form.llmApiKey}
            onChange={(e) => setForm((f) => ({ ...f, llmApiKey: e.target.value }))}
            placeholder={data?.hasLlmKey ? "••••••••  (đã cấu hình qua biến môi trường)" : "Chưa cấu hình"}
          />
          <p className="text-xs text-muted-foreground">
            API key không được lưu vào database. Đặt biến môi trường{" "}
            <code className="rounded bg-muted px-1">LLM_API_KEY</code> trên server rồi khởi động lại ứng dụng.
          </p>
          <div className="flex items-center gap-1.5 text-xs">
            {data?.hasLlmKey ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700">Đã phát hiện API key trên server</span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-red-600" />
                <span className="text-red-700">Chưa có API key trên server</span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-system-prompt">System prompt tùy chỉnh (tùy chọn)</Label>
          <Textarea
            id="llm-system-prompt"
            value={form.llmSystemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, llmSystemPrompt: e.target.value }))}
            placeholder="Để trống để dùng system prompt mặc định của Anima Studio."
            className="min-h-32"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {hasUnsavedChanges && <Badge variant="destructive">Có thay đổi chưa lưu</Badge>}
          <Button onClick={handleSave} disabled={updateMutation.isPending || !hasUnsavedChanges}>
            {updateMutation.isPending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
