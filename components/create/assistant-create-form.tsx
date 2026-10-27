"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Wand2, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BatchTracker } from "@/components/create/batch-tracker";
import { useStyles } from "@/hooks/use-styles";
import { useSettings } from "@/hooks/use-settings";
import { useWorkflow } from "@/hooks/use-workflow";
import { useHeaderConnectionState } from "@/hooks/use-connection";
import { useCreateGeneration } from "@/hooks/use-generations";
import { useSuggestPrompts } from "@/hooks/use-llm-suggest";
import type { LlmSuggestionResult } from "@/lib/validations/llm";
import { ApiRequestError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export function AssistantCreateForm() {
  const { data: styles } = useStyles();
  const { data: settings } = useSettings();
  const { data: workflow } = useWorkflow();
  const { state: connectionState } = useHeaderConnectionState();
  const suggestMutation = useSuggestPrompts();
  const createMutation = useCreateGeneration();

  const activeStyles = useMemo(() => (styles ?? []).filter((s) => s.isActive), [styles]);

  const [requestText, setRequestText] = useState("");
  const [imageCount, setImageCount] = useState(4);
  const [styleId, setStyleId] = useState("");
  const [suggestions, setSuggestions] = useState<LlmSuggestionResult | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const maxImages = settings?.maxImagesPerBatch ?? 8;
  const workflowReady = Boolean(workflow?.configured && workflow.isValidated);
  const isReady = connectionState === "connected" && workflowReady;
  const llmReady = Boolean(settings?.llmBaseUrl && settings?.llmModel && settings?.hasLlmKey);
  // "Tạo mô tả" chỉ gọi LLM, không đụng ComfyUI -> chỉ cần llmReady.
  const canSuggest = llmReady && requestText.trim().length > 0 && !suggestMutation.isPending;
  // Chỉ bước "Tạo ảnh" cuối mới cần ComfyUI connected + workflow validated.
  const canSubmit = Boolean(suggestions) && isReady && !createMutation.isPending;

  function handleCountChange(next: number) {
    setImageCount(Math.max(1, Math.min(maxImages, next)));
  }

  function handleSuggest() {
    suggestMutation.mutate(
      { request: requestText.trim(), count: imageCount, styleId: styleId || undefined },
      {
        onSuccess: (result) => setSuggestions(result),
        onError: (error) => {
          toast.error(error instanceof ApiRequestError ? error.message : "Tạo mô tả thất bại");
        },
      },
    );
  }

  function handleEditRequest() {
    setSuggestions(null);
  }

  function handleSubmit() {
    if (!suggestions) return;
    createMutation.mutate(
      {
        styleId: styleId || undefined,
        ideaPrompt: requestText.trim(),
        images: suggestions.images.map((image) => ({
          positiveOverride: image.positive,
          negativeOverride: suggestions.negative || undefined,
        })),
        seedMode: "random",
      },
      {
        onSuccess: (batch) => {
          setActiveBatchId(batch.id);
          toast.success(`Đã gửi ${batch.jobs.length} ảnh để tạo`);
        },
        onError: (error) => {
          toast.error(error instanceof ApiRequestError ? error.message : "Tạo ảnh thất bại");
        },
      },
    );
  }

  if (activeBatchId) {
    return <BatchTracker batchId={activeBatchId} onReset={() => setActiveBatchId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Trợ lý AI</h1>
        <p className="text-sm text-muted-foreground">
          Gõ ý tưởng bằng lời của bạn, AI sẽ tự viết yêu cầu chi tiết cho từng ảnh.
        </p>
      </div>

      {!llmReady && (
        <Alert variant="destructive">
          <AlertTitle>Chưa cấu hình Trợ lý AI</AlertTitle>
          <AlertDescription>
            Nhờ người cài đặt vào{" "}
            <Link href="/settings" className="underline underline-offset-4">
              trang Cài đặt
            </Link>{" "}
            để kết nối Trợ lý AI (base URL, model, API key) trước khi soạn mô tả. Bước này không cần ComfyUI.
          </AlertDescription>
        </Alert>
      )}

      {!suggestions ? (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-medium">Nhân vật</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setStyleId("")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                    styleId === "" ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                  )}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg">
                    <Wand2 className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Để AI tự quyết</span>
                </button>
                {activeStyles.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setStyleId(style.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                      styleId === style.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                      {style.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium">{style.name}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-medium">Số lượng ảnh</h3>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => handleCountChange(imageCount - 1)} disabled={imageCount <= 1}>
                  −
                </Button>
                <span className="w-12 text-center text-lg font-semibold">{imageCount}</span>
                <Button variant="outline" size="icon" onClick={() => handleCountChange(imageCount + 1)} disabled={imageCount >= maxImages}>
                  +
                </Button>
                <span className="text-xs text-muted-foreground">Tối đa {maxImages} ảnh/lần</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-medium">Ý tưởng của bạn</h3>
              <Textarea
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder="Ví dụ: cô gái tóc đỏ dạo phố Nhật Bản vào mùa thu, không khí ấm áp..."
                className="min-h-28"
              />
              <p className="text-xs text-muted-foreground">
                Bước này chỉ cần AI soạn mô tả, chưa cần GPU/ComfyUI. ComfyUI chỉ cần sẵn sàng khi bạn bấm &quot;Tạo ảnh&quot; ở bước sau.
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end">
            <Button size="lg" onClick={handleSuggest} disabled={!canSuggest}>
              {suggestMutation.isPending ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" /> Đang soạn...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" /> Tạo mô tả
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          {!isReady && (
            <Alert variant="destructive">
              <AlertTitle>Chưa sẵn sàng để tạo ảnh</AlertTitle>
              <AlertDescription>
                {!workflow?.configured
                  ? "Chưa cấu hình workflow. "
                  : !workflow.isValidated
                    ? "Workflow chưa được validate. "
                    : "Chưa kết nối ComfyUI. "}
                Nhờ người cài đặt vào{" "}
                <Link href="/settings" className="underline underline-offset-4">
                  trang Cài đặt
                </Link>{" "}
                để hoàn tất trước khi bấm &quot;Tạo ảnh&quot;.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {suggestions.images.map((image, index) => (
              <Card key={index}>
                <CardContent className="space-y-1 p-4">
                  <p className="text-sm font-medium">Ảnh {index + 1}</p>
                  <p className="text-sm text-muted-foreground">{image.caption}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-md border bg-background p-4">
            <Button variant="ghost" onClick={handleEditRequest} disabled={createMutation.isPending}>
              <RotateCcw className="h-4 w-4" /> Chỉnh lại yêu cầu
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSuggest} disabled={suggestMutation.isPending || createMutation.isPending}>
                <Wand2 className="h-4 w-4" /> Soạn lại
              </Button>
              <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
                {createMutation.isPending ? (
                  <>
                    <Sparkles className="h-4 w-4 animate-pulse" /> Đang gửi...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Tạo ảnh
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
