"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderOpen, ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMediums } from "@/hooks/use-mediums";
import { useSettings, useAdvancedMode, useUpdateSettings } from "@/hooks/use-settings";
import { useWorkflow } from "@/hooks/use-workflow";
import { useHeaderConnectionState } from "@/hooks/use-connection";
import { useEnqueueDraft } from "@/hooks/use-draft-queue";
import { useOpenDirectory } from "@/lib/hooks/use-electron";
import type { WorkflowSummaryResponse } from "@/lib/types";
import { ApiRequestError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { CALENDAR_IMAGE_COUNT } from "@/lib/calendar/constants";
import { DraftQueuePanel } from "@/components/create/draft-queue-panel";

type AdvancedParamField = "width" | "height" | "steps" | "cfg";
type AdvancedParams = Record<AdvancedParamField, string>;

// Tỉ lệ ~1.21 (1152×952) khớp đúng khổ trang lịch (14×11.5"=1.213, 11×8.5"=1.286)
// nên upscale chỉ là phóng to thuần: không viền mờ, không bao giờ cắt 2 bên (chữ
// bìa an toàn), khổ rộng hơn chỉ hao một tí trên/dưới. Vẫn là khung NGANG hợp bố
// cục bìa tạp chí/điện ảnh (model tự vẽ chữ vào ảnh #1), tránh full-body khung
// dọc dễ sai tỉ lệ đầu/thân trên Turbo CFG=1. Áp cho cả batch (bìa + mọi trang).
const COVER_DEFAULT_WIDTH = 1152;
const COVER_DEFAULT_HEIGHT = 952;

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
  const enqueueMutation = useEnqueueDraft();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const updateSettings = useUpdateSettings();
  const openDirectory = useOpenDirectory();
  const [showDirDialog, setShowDirDialog] = useState(false);

  const workflowReady = Boolean(workflow?.configured && workflow.isValidated);
  const isReady = connectionState === "connected" && workflowReady;
  // Trợ lý AI yêu cầu API key đã cấu hình trong Cài đặt (settings.hasLlmKey).
  const llmReady = Boolean(settings?.hasLlmKey);
  const isSubmitting = enqueueMutation.isPending;
  const canGenerate = llmReady && isReady && requestText.trim().length > 0 && !isSubmitting;

  async function handleChangeSaveDir() {
    const dir = await openDirectory();
    if (dir) updateSettings.mutate({ outputDirectory: dir });
  }

  function doEnqueue() {
    enqueueMutation.mutate(
      {
        request: requestText.trim(),
        mediumId: mediumId || undefined,
        width: params.width ? Number(params.width) : undefined,
        height: params.height ? Number(params.height) : undefined,
        steps: params.steps ? Number(params.steps) : undefined,
        cfg: params.cfg ? Number(params.cfg) : undefined,
      },
      {
        onSuccess: (batch) => {
          setRequestText("");
          textareaRef.current?.focus();
          toast.success("Đã thêm vào hàng đợi — bạn có thể nhập bộ tiếp theo", {
            action: { label: "Xem", onClick: () => router.push(`/history?batch=${batch.id}`) },
          });
        },
        onError: (error) => {
          toast.error(error instanceof ApiRequestError ? error.message : "Không thêm được vào hàng đợi");
        },
      },
    );
  }

  function handleEnqueue() {
    if (settings?.outputDirectory === "outputs") {
      setShowDirDialog(true);
      return;
    }
    doEnqueue();
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
            ref={textareaRef}
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canGenerate) {
                e.preventDefault();
                handleEnqueue();
              }
            }}
            placeholder="Ví dụ: cô gái tóc đỏ dạo phố Nhật Bản vào mùa thu, không khí ấm áp..."
            className="min-h-28"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Càng cụ thể (nhân vật, bối cảnh, mùa, cảm xúc) thì ảnh càng đúng ý. Nhấn Ctrl+Enter để thêm nhanh.
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

      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            Lưu vào: <span className="text-foreground">{settings?.outputDirectory || "outputs"}</span>
          </span>
        </div>
        <Button type="button" variant="ghost" size="sm" className="ml-2 h-7 shrink-0" onClick={handleChangeSaveDir}>
          Đổi
        </Button>
      </div>

      <div className="space-y-2">
        <Button size="lg" className="w-full text-base font-semibold" onClick={handleEnqueue} disabled={!canGenerate}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Đang thêm...
            </>
          ) : (
            <>
              <ListPlus className="h-5 w-5" /> Thêm vào hàng đợi
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {requestText.trim().length === 0
            ? "Nhập ý tưởng để bắt đầu"
            : "AI soạn mô tả và tạo ảnh ở chế độ nền — bạn có thể thêm bộ tiếp hoặc chuyển trang ngay."}
        </p>
      </div>

      <AlertDialog open={showDirDialog} onOpenChange={setShowDirDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chọn thư mục lưu ảnh</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn chưa chọn thư mục lưu ảnh. Hãy chọn một thư mục cụ thể để dễ tìm ảnh sau khi tạo xong, hoặc dùng
              thư mục mặc định (<code>outputs</code> trong thư mục cài đặt app).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDirDialog(false); doEnqueue(); }}>
              Dùng thư mục mặc định
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowDirDialog(false);
                const dir = await openDirectory();
                if (dir) {
                  updateSettings.mutate({ outputDirectory: dir }, { onSuccess: () => doEnqueue() });
                } else {
                  doEnqueue();
                }
              }}
            >
              <FolderOpen className="h-4 w-4" /> Chọn thư mục
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DraftQueuePanel />
    </div>
  );
}
