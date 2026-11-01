"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Wand2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BatchTracker } from "@/components/create/batch-tracker";
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
  const { data: mediums } = useMediums();
  const { data: settings } = useSettings();
  const { data: workflow } = useWorkflow();
  const { state: connectionState } = useHeaderConnectionState();
  const suggestMutation = useSuggestPrompts();
  const createMutation = useCreateGeneration();

  const activeMediums = useMemo(() => (mediums ?? []).filter((m) => m.isActive), [mediums]);

  const [requestText, setRequestText] = useState("");
  const [imageCount, setImageCount] = useState(12);
  const [mediumId, setMediumId] = useState("");
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [params, setParams] = useState<AdvancedParams>({ width: "", height: "", steps: "", cfg: "" });

  // Không còn lựa chọn "để AI tự quyết" -- luôn chọn sẵn kiểu ảnh đầu tiên
  // (sortOrder thấp nhất, API đã sắp xếp) ngay khi danh sách tải xong.
  useEffect(() => {
    if (!mediumId && activeMediums.length > 0) {
      setMediumId(activeMediums[0].id);
    }
  }, [activeMediums, mediumId]);

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

  const maxImages = settings?.maxImagesPerBatch ?? 15;
  // Settings tải không đồng bộ, và trần có thể bị hạ trong Cài đặt -- kẹp lại
  // để số hiển thị/gửi đi không bao giờ vượt trần (server sẽ từ chối batch).
  const safeImageCount = Math.min(imageCount, maxImages);
  const workflowReady = Boolean(workflow?.configured && workflow.isValidated);
  const isReady = connectionState === "connected" && workflowReady;
  const llmReady = Boolean(settings?.llmBaseUrl && settings?.llmModel && settings?.hasLlmKey);
  // Một nút "Tạo ảnh" chạy cả soạn prompt (LLM) lẫn gửi gen (ComfyUI) nên cần
  // đủ cả hai sẵn sàng ngay từ đầu.
  const canGenerate =
    llmReady &&
    isReady &&
    requestText.trim().length > 0 &&
    !suggestMutation.isPending &&
    !createMutation.isPending;

  function handleCountChange(next: number) {
    setImageCount(Math.max(1, Math.min(maxImages, next)));
  }

  // Bấm 1 lần: LLM soạn mô tả -> tự gửi batch tạo ảnh. Người dùng không xem lại
  // prompt ở giữa; lỗi ở bước nào cũng toast và giữ nguyên màn nhập.
  function handleGenerate() {
    suggestMutation.mutate(
      {
        request: requestText.trim(),
        count: safeImageCount,
        mediumId: mediumId || undefined,
      },
      {
        onSuccess: (result) => submitBatch(result),
        onError: (error) => {
          toast.error(error instanceof ApiRequestError ? error.message : "Tạo mô tả thất bại");
        },
      },
    );
  }

  function submitBatch(suggestions: SuggestPromptsResponse) {
    // Chung 1 seed cho cả batch để gương mặt đồng nhất giữa các ảnh trong cùng
    // lần gen; mỗi lần bấm Tạo lại random seed mới nên các lần gen vẫn khác nhau.
    const sharedSeed = randomSeed();
    // Kiểu ảnh (Người thực/Anime...) ghép tag phong cách/chất lượng do app
    // kiểm soát vào trước mỗi positive, và trộn vào negative chung -- không
    // phụ thuộc vào chất lượng tag mà LLM tự viết.
    const medium = activeMediums.find((m) => m.id === mediumId);
    createMutation.mutate(
      {
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
            để kết nối Trợ lý AI (base URL, model, API key). Cần có trước khi tạo ảnh.
          </AlertDescription>
        </Alert>
      )}

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

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">Kiểu ảnh</h3>
          <p className="text-xs text-muted-foreground">
            Chọn một kiểu để app tự ghép tag phong cách/chất lượng chuẩn (ổn định, không phụ thuộc AI).
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
            <Button variant="outline" size="icon" onClick={() => handleCountChange(safeImageCount - 1)} disabled={safeImageCount <= 1}>
              −
            </Button>
            <span className="w-12 text-center text-lg font-semibold">{safeImageCount}</span>
            <Button variant="outline" size="icon" onClick={() => handleCountChange(safeImageCount + 1)} disabled={safeImageCount >= maxImages}>
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
            Bấm &quot;Tạo ảnh&quot; là AI tự soạn mô tả chi tiết rồi tạo ảnh luôn. Cần Trợ lý AI và ComfyUI đã sẵn sàng.
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
        <Button size="lg" onClick={handleGenerate} disabled={!canGenerate}>
          {suggestMutation.isPending ? (
            <>
              <Sparkles className="h-4 w-4 animate-pulse" /> Đang soạn mô tả...
            </>
          ) : createMutation.isPending ? (
            <>
              <Sparkles className="h-4 w-4 animate-pulse" /> Đang tạo ảnh...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" /> Tạo ảnh
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
