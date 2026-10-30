"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Wand2, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BatchTracker } from "@/components/create/batch-tracker";
import { useStyles } from "@/hooks/use-styles";
import { useMediums } from "@/hooks/use-mediums";
import { useSettings } from "@/hooks/use-settings";
import { useWorkflow } from "@/hooks/use-workflow";
import { useHeaderConnectionState } from "@/hooks/use-connection";
import { useCreateGeneration } from "@/hooks/use-generations";
import { useSuggestPrompts } from "@/hooks/use-llm-suggest";
import { randomSeed } from "@/lib/seed";
import { mergeTags } from "@/lib/prompts/merge-tags";
import type { SuggestPromptsResponse } from "@/lib/validations/llm";
import type { WorkflowSummaryResponse } from "@/lib/types";
import { ApiRequestError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type AdvancedParamField = "width" | "height" | "steps" | "cfg";
type AdvancedParams = Record<AdvancedParamField, string>;

// Mặc định ngang 4:3 -- khung ngang hợp bố cục bìa tạp chí/điện ảnh (model ảnh
// tự vẽ chữ vào ảnh #1), tránh full-body đứng khung dọc dễ gây sai tỉ lệ
// đầu/thân trên Turbo CFG=1.
const COVER_DEFAULT_WIDTH = 1152;
const COVER_DEFAULT_HEIGHT = 864;

/**
 * Reads a field's current literal value out of the imported workflow JSON via
 * its node mapping, so the Trợ lý AI form can pre-fill CFG/steps/size with the
 * workflow's real defaults instead of app-level guesses. Returns "" when the
 * field is unmapped/disabled or the value isn't a plain number (e.g. a wired
 * node reference), in which case we send nothing and let the backend keep the
 * workflow's own value. `valuePreview` for numbers is their full string form.
 */
function readWorkflowNumber(workflow: WorkflowSummaryResponse | undefined, field: AdvancedParamField): string {
  const fieldMapping = workflow?.mapping?.[field];
  if (!fieldMapping?.enabled) return "";
  const node = workflow?.nodes?.find((n) => n.nodeId === fieldMapping.nodeId);
  const input = node?.inputs.find((i) => i.key === fieldMapping.inputKey);
  const value = input ? Number(input.valuePreview) : NaN;
  return Number.isFinite(value) ? String(value) : "";
}

export function AssistantCreateForm() {
  const { data: styles } = useStyles();
  const { data: mediums } = useMediums();
  const { data: settings } = useSettings();
  const { data: workflow } = useWorkflow();
  const { state: connectionState } = useHeaderConnectionState();
  const suggestMutation = useSuggestPrompts();
  const createMutation = useCreateGeneration();

  const activeStyles = useMemo(() => (styles ?? []).filter((s) => s.isActive), [styles]);
  const activeMediums = useMemo(() => (mediums ?? []).filter((m) => m.isActive), [mediums]);

  const [requestText, setRequestText] = useState("");
  const [imageCount, setImageCount] = useState(4);
  const [styleId, setStyleId] = useState("");
  const [mediumId, setMediumId] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestPromptsResponse | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [params, setParams] = useState<AdvancedParams>({ width: "", height: "", steps: "", cfg: "" });

  // Pre-fill the advanced params from the workflow's own values once per
  // (re)fetch, mirroring create-form's settings sync. We never re-sync on later
  // renders, so a value the user has edited is left untouched.
  const [syncedWorkflow, setSyncedWorkflow] = useState<typeof workflow>(undefined);
  if (workflow !== syncedWorkflow) {
    setSyncedWorkflow(workflow);
    if (workflow?.configured) {
      setParams({
        width: String(COVER_DEFAULT_WIDTH),
        height: String(COVER_DEFAULT_HEIGHT),
        steps: readWorkflowNumber(workflow, "steps"),
        cfg: readWorkflowNumber(workflow, "cfg"),
      });
    }
  }

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
      {
        request: requestText.trim(),
        count: imageCount,
        styleId: styleId || undefined,
        mediumId: mediumId || undefined,
      },
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
    // Chung 1 seed cho cả batch để gương mặt đồng nhất giữa các ảnh trong cùng
    // lần gen; mỗi lần bấm Tạo lại random seed mới nên các lần gen vẫn khác nhau.
    const sharedSeed = randomSeed();
    // Kiểu ảnh (Người thực/Anime...) ghép tag phong cách/chất lượng do app
    // kiểm soát vào trước mỗi positive, và trộn vào negative chung -- không
    // phụ thuộc vào chất lượng tag mà LLM tự viết.
    const medium = activeMediums.find((m) => m.id === mediumId);
    createMutation.mutate(
      {
        styleId: styleId || undefined,
        ideaPrompt: requestText.trim(),
        images: suggestions.images.map((image) => ({
          positiveOverride: mergeTags(medium?.positivePrompt, image.positive),
          negativeOverride: mergeTags(medium?.negativePrompt, suggestions.negative) || undefined,
        })),
        // Để trống một ô -> undefined -> backend giữ giá trị của workflow JSON.
        width: params.width ? Number(params.width) : undefined,
        height: params.height ? Number(params.height) : undefined,
        steps: params.steps ? Number(params.steps) : undefined,
        cfg: params.cfg ? Number(params.cfg) : undefined,
        seedMode: "fixed",
        fixedSeed: sharedSeed,
        incrementFixedSeed: false,
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
          Gõ ý tưởng bằng lời của bạn, AI sẽ tự viết yêu cầu chi tiết cho từng ảnh và tự tạo ảnh đầu thành bìa
          lịch (tên + năm do AI tự quyết nếu bạn không nêu).
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
              <h3 className="text-sm font-medium">Kiểu ảnh</h3>
              <p className="text-xs text-muted-foreground">
                Chọn một kiểu để app tự ghép tag phong cách/chất lượng chuẩn (ổn định, không phụ thuộc AI). Để trống
                nếu muốn AI tự chọn phong cách.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setMediumId("")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                    mediumId === "" ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                  )}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg">
                    <Wand2 className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Để AI tự quyết</span>
                </button>
                {activeMediums.map((medium) => (
                  <button
                    key={medium.id}
                    type="button"
                    onClick={() => setMediumId(medium.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                      mediumId === medium.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                      {medium.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium">{medium.name}</span>
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

          <Accordion>
            <AccordionItem value="advanced-params">
              <AccordionTrigger>Thông số nâng cao (tuỳ chọn)</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Width</Label>
                    <Input
                      type="number"
                      min={64}
                      max={4096}
                      value={params.width}
                      onChange={(e) => setParams((prev) => ({ ...prev, width: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Height</Label>
                    <Input
                      type="number"
                      min={64}
                      max={4096}
                      value={params.height}
                      onChange={(e) => setParams((prev) => ({ ...prev, height: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Steps</Label>
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={params.steps}
                      onChange={(e) => setParams((prev) => ({ ...prev, steps: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CFG</Label>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      step="0.1"
                      value={params.cfg}
                      onChange={(e) => setParams((prev) => ({ ...prev, cfg: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mặc định điền sẵn theo workflow. Để trống một ô = giữ giá trị của workflow. Các thông số này chỉ áp cho
                  bước gen chính; bước sửa tay (detailer) không đổi.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

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
                  <p className="text-sm font-medium">
                    Ảnh {index + 1}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {index === 0 ? "· Trang bìa (có chữ)" : "· Artwork (không chữ)"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">{image.caption}</p>
                  {image.title && image.year ? (
                    <div className="rounded border bg-muted/50 p-2 text-xs">
                      <p className="font-medium text-muted-foreground">Chữ do AI vẽ trong ảnh</p>
                      <ul className="mt-1 space-y-0.5">
                        <li>
                          <span className="text-muted-foreground">title:</span> {image.title}
                        </li>
                        <li>
                          <span className="text-muted-foreground">year:</span> {image.year}
                        </li>
                      </ul>
                    </div>
                  ) : null}
                  <details className="pt-1 text-xs">
                    <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                      Chi tiết kỹ thuật (dev)
                    </summary>
                    <p className="mt-1 rounded bg-muted p-2 font-mono text-[0.7rem] break-words">{image.positive}</p>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-2 p-4 text-xs">
              <details>
                <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                  Negative prompt dùng chung (dev)
                </summary>
                <p className="mt-1 rounded bg-muted p-2 font-mono text-[0.7rem] break-words">{suggestions.negative || "—"}</p>
              </details>
              <p className="text-muted-foreground">
                Token:{" "}
                {suggestions.usage
                  ? `prompt ${suggestions.usage.promptTokens ?? "—"} · completion ${suggestions.usage.completionTokens ?? "—"} · tổng ${suggestions.usage.totalTokens ?? "—"}`
                  : "—"}
              </p>
            </CardContent>
          </Card>

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
