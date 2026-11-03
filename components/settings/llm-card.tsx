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

/**
 * Trợ lý AI KHÔNG còn base URL/API key riêng -- nó đi qua cùng gateway Colab
 * với ComfyUI (route "/llm" cạnh "/censor"); key thật chỉ nằm ở Colab (nhập
 * bằng getpass, Cell 7.6 trong notebook), nên không bao giờ lộ khi app release
 * lên GitHub hoặc đóng gói installer. Xem lib/llm/resolve-config.ts.
 */
export function LlmCard() {
  const { data, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState({ llmModel: "", llmSystemPrompt: "" });

  const [syncedData, setSyncedData] = useState<typeof data>(undefined);
  if (data !== syncedData) {
    setSyncedData(data);
    if (data) {
      setForm({
        llmModel: data.llmModel ?? "",
        llmSystemPrompt: data.llmSystemPrompt ?? "",
      });
    }
  }

  const hasUnsavedChanges =
    Boolean(data) &&
    (form.llmModel !== (data!.llmModel ?? "") || form.llmSystemPrompt !== (data!.llmSystemPrompt ?? ""));

  function handleSave() {
    updateMutation.mutate(
      {
        llmModel: form.llmModel || null,
        llmSystemPrompt: form.llmSystemPrompt || null,
      },
      {
        onSuccess: () => toast.success("Đã lưu cấu hình Trợ lý AI"),
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
          Dùng chung URL ComfyUI đã cấu hình ở trên để gọi LLM qua gateway Colab -- không cần nhập base URL hay API
          key riêng ở đây; API key thật chỉ nằm ở Colab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-1.5 text-xs">
          {data?.hasLlmKey ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-700">Sẵn sàng (đã có URL ComfyUI)</span>
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              <span className="text-red-700">Chưa có URL ComfyUI -- cấu hình ở thẻ &quot;Kết nối ComfyUI&quot; phía trên</span>
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-model">Model (tuỳ chọn)</Label>
          <Input
            id="llm-model"
            value={form.llmModel}
            onChange={(e) => setForm((f) => ({ ...f, llmModel: e.target.value }))}
            placeholder="grok-4-fast-non-reasoning (mặc định phía Colab)"
          />
          <p className="text-xs text-muted-foreground">
            Để trống để dùng model mặc định đã cấu hình phía Colab. Chỉ điền nếu bạn đã đổi model khác ở Cell 7.6
            của notebook (biến <code className="rounded bg-muted px-1">LLM_MODEL</code>) và muốn app gửi đúng tên đó.
          </p>
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
