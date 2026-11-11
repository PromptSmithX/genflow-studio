"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wand2, Loader2, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMediums } from "@/hooks/use-mediums";
import { useSettings, useAdvancedMode } from "@/hooks/use-settings";
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
import { setNavigationLock } from "@/lib/client/navigation-lock";

type AdvancedParamField = "width" | "height" | "steps" | "cfg";
type AdvancedParams = Record<AdvancedParamField, string>;

// Tỉ lệ ~1.21 (1152×952) khớp đúng khổ trang lịch (14×11.5"=1.213, 11×8.5"=1.286)
// nên upscale chỉ là phóng to thuần: không viền mờ, không bao giờ cắt 2 bên (chữ
// bìa an toàn), khổ rộng hơn chỉ hao một tí trên/dưới. Vẫn là khung NGANG hợp bố
// cục bìa tạp chí/điện ảnh (model tự vẽ chữ vào ảnh #1), tránh full-body khung
// dọc dễ sai tỉ lệ đầu/thân trên Turbo CFG=1. Áp cho cả batch (bìa + mọi trang).
const COVER_DEFAULT_WIDTH = 1152;
const COVER_DEFAULT_HEIGHT = 952;

// 1 bìa trước + 12 tháng; bìa sau do app tự ghép -> đủ 14 trang cho file in và mockup.
const CALENDAR_IMAGE_COUNT = 13;

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
  const advancedMode = useAdvancedMode();
  const { data: workflow } = useWorkflow();
  const { state: connectionState } = useHeaderConnectionState();
  const suggestMutation = useSuggestPrompts();
  const createMutation = useCreateGeneration();
  const router = useRouter();

  const activeMediums = useMemo(() => (mediums ?? []).filter((m) => m.isActive), [mediums]);

  const [requestText, setRequestText] = useState("");
  const [mediumId, setMediumId] = useState("");
  const [params, setParams] = useState<AdvancedParams>({ width: "", height: "", steps: "", cfg: "" });

  // Không còn lựa chọn "để AI tự quyết" -- luôn chọn sẵn kiểu ảnh đầu tiên
  // (sortOrder thấp nhất, API đã sắp xếp) ngay khi danh sách tải xong.
  if (!mediumId && activeMediums.length > 0) {
    setMediumId(activeMediums[0].id);
  }

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

  // Luôn tạo cố định 1 bộ lịch 13 ảnh. Vẫn kẹp theo trần trong Cài đặt (tải không
  // đồng bộ, có thể bị hạ) để server không từ chối batch.
  const safeImageCount = Math.min(CALENDAR_IMAGE_COUNT, settings?.maxImagesPerBatch ?? 15);
  const workflowReady = Boolean(workflow?.configured && workflow.isValidated);
  const isReady = connectionState === "connected" && workflowReady;
  // Trợ lý AI yêu cầu API key đã cấu hình trong Cài đặt (settings.hasLlmKey).
  const llmReady = Boolean(settings?.hasLlmKey);
  // Một nút "Tạo ảnh" chạy cả soạn prompt (LLM) lẫn gửi gen (ComfyUI) nên cần
  // đủ cả hai sẵn sàng ngay từ đầu.
  const isWorking = suggestMutation.isPending || createMutation.isPending;
  const canGenerate = llmReady && isReady && requestText.trim().length > 0 && !isWorking;

  // Rời trang giữa chừng sẽ huỷ form -> bước tạo batch (gọi trong onSuccess của
  // bước soạn prompt) không chạy -> mất ảnh mà người dùng không biết. Khoá điều
  // hướng ở sidebar trong suốt thời gian đang làm; cleanup mở khoá kể cả khi unmount.
  useEffect(() => {
    if (!isWorking) return;
    setNavigationLock("Đang tạo ảnh — vui lòng đợi xong rồi mới chuyển trang, nếu không ảnh sẽ không được tạo.");
    return () => setNavigationLock(null);
  }, [isWorking]);

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
        mediumId: mediumId || undefined,
        images: suggestions.images.map((image) => ({
          positiveOverride: mergeTags(medium?.positivePrompt, image.positive),
          negativeOverride: mergeTags(medium?.negativePrompt, suggestions.negative) || undefined,
        })),
        etsy: suggestions.etsy
          ? {
              title: suggestions.etsy.title || undefined,
              description: suggestions.etsy.description || undefined,
              tags: suggestions.etsy.tags.length ? suggestions.etsy.tags : undefined,
            }
          : undefined,
        concept:
          suggestions.concept || suggestions.conceptSeedKey || suggestions.appearanceKey
            ? {
                theme: suggestions.concept?.campaignTheme || undefined,
                anchorTags: suggestions.concept?.anchorTags || undefined,
                seedKey: suggestions.conceptSeedKey || undefined,
                appearanceKey: suggestions.appearanceKey || undefined,
              }
            : undefined,
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
          toast.success(`Đã gửi ${batch.jobs.length} ảnh để tạo. Theo dõi tiến độ ở trang Kết quả.`);
          router.push(`/history?batch=${batch.id}`);
        },
        onError: (error) => {
          toast.error(error instanceof ApiRequestError ? error.message : "Tạo ảnh thất bại");
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Tạo bộ lịch mới</h2>
        <p className="text-sm text-muted-foreground">
          Gõ ý tưởng bằng lời của bạn. AI sẽ tự viết mô tả cho từng ảnh, ảnh đầu tiên thành bìa lịch (tên + năm do AI
          tự đặt nếu bạn không nêu).
        </p>
      </div>

      {!(llmReady && isReady) && (
        <Alert variant="destructive">
          <AlertTitle>App chưa sẵn sàng để tạo ảnh</AlertTitle>
          <AlertDescription>
            {!workflow?.configured || !workflow?.isValidated ? (
              <>Liên hệ người cài đặt hoặc bật Chế độ nâng cao trong Cài đặt.</>
            ) : !llmReady ? (
              <>
                Trợ lý AI chưa có API key. Vào{" "}
                <Link href="/settings" className="underline underline-offset-4">
                  Cài đặt → Trợ lý AI
                </Link>{" "}
                để nhập key.
              </>
            ) : (
              <>
                Máy tạo ảnh chưa được kết nối hoặc chưa cài đặt xong. Nhờ người cài đặt vào{" "}
                <Link href="/settings" className="underline underline-offset-4">
                  trang Cài đặt
                </Link>{" "}
                để hoàn tất.
              </>
            )}
            <span className="mt-1 block text-xs opacity-80">
              Chi tiết:{" "}
              {!llmReady
                ? "chưa có API key Trợ lý AI (Cài đặt → Trợ lý AI)"
                : !workflow?.configured
                  ? "chưa import workflow"
                  : !workflow.isValidated
                    ? "workflow chưa được validate"
                    : "chưa kết nối được ComfyUI"}
              .
            </span>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">1. Ý tưởng của bạn</h3>
          <Textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="Ví dụ: cô gái tóc đỏ dạo phố Nhật Bản vào mùa thu, không khí ấm áp..."
            className="min-h-28"
            autoFocus
            disabled={isWorking}
          />
          <p className="text-xs text-muted-foreground">
            Càng cụ thể (nhân vật, bối cảnh, mùa, cảm xúc) thì ảnh càng đúng ý.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">2. Kiểu ảnh</h3>
          <p className="text-xs text-muted-foreground">
            Cả bộ lịch sẽ theo cùng một kiểu này. Mỗi lần tạo {CALENDAR_IMAGE_COUNT} ảnh: 1 bìa trước + 12 tháng (bìa
            sau app tự ghép khi xuất file in).
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {activeMediums.map((medium) => (
              <button
                key={medium.id}
                type="button"
                onClick={() => setMediumId(medium.id)}
                disabled={isWorking}
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


      {advancedMode && (
        <Accordion>
          <AccordionItem value="advanced-params">
            <AccordionTrigger>Tuỳ chỉnh nâng cao (không cần chỉnh nếu không chắc)</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label>Chiều rộng (px)</Label>
                  <Input
                    type="number"
                    min={64}
                    max={4096}
                    value={params.width}
                    onChange={(e) => setParams((prev) => ({ ...prev, width: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Chiều cao (px)</Label>
                  <Input
                    type="number"
                    min={64}
                    max={4096}
                    value={params.height}
                    onChange={(e) => setParams((prev) => ({ ...prev, height: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Số bước vẽ (steps)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={params.steps}
                    onChange={(e) => setParams((prev) => ({ ...prev, steps: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Độ bám mô tả (CFG)</Label>
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
                Đã điền sẵn giá trị chuẩn. Để trống một ô = dùng giá trị của workflow. Các thông số này chỉ áp cho bước
                vẽ chính; bước sửa chi tiết (detailer) không đổi.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {isWorking && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <ProgressStep
              state={suggestMutation.isPending ? "active" : "done"}
              text={`AI đang viết mô tả cho ${safeImageCount} ảnh — thường mất 1–2 phút, đừng đóng app hoặc chuyển trang.`}
            />
            <ProgressStep
              state={createMutation.isPending ? "active" : "waiting"}
              text="Gửi sang máy tạo ảnh — xong sẽ tự chuyển sang trang Kết quả."
            />
            <p className="pt-1 text-xs text-muted-foreground">
              Vui lòng ở lại trang này cho tới khi xong — chuyển trang lúc này ảnh sẽ không được tạo.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {!isWorking && requestText.trim().length === 0 && (
          <p className="text-center text-xs text-muted-foreground">Nhập ý tưởng để bắt đầu</p>
        )}
        <Button size="lg" className="w-full text-base font-semibold" onClick={handleGenerate} disabled={!canGenerate}>
          {isWorking ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Đang xử lý...
            </>
          ) : (
            <>
              <Wand2 className="h-5 w-5" /> Tạo bộ lịch
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ProgressStep({ state, text }: { state: "waiting" | "active" | "done"; text: string }) {
  return (
    <div className={cn("flex items-start gap-2", state === "waiting" && "text-muted-foreground")}>
      {state === "done" ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : state === "active" ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{text}</span>
    </div>
  );
}
