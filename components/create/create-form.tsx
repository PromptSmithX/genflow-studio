"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageConfigCard, type ImageRowState } from "@/components/create/image-config-card";
import { AdvancedSettings, type AdvancedSettingsState } from "@/components/create/advanced-settings";
import { BatchTracker } from "@/components/create/batch-tracker";
import { useStyles } from "@/hooks/use-styles";
import { useGlobalPrompt } from "@/hooks/use-global-prompt";
import { useSettings } from "@/hooks/use-settings";
import { useWorkflow } from "@/hooks/use-workflow";
import { useHeaderConnectionState } from "@/hooks/use-connection";
import { useCreateGeneration } from "@/hooks/use-generations";
import { ApiRequestError } from "@/lib/client/api";

function makeLocalId() {
  return Math.random().toString(36).slice(2);
}

function makeRow(defaultStyleId: string): ImageRowState {
  return { localId: makeLocalId(), styleId: defaultStyleId, positiveOverride: "", negativeOverride: "" };
}

export function CreateForm() {
  const { data: styles } = useStyles();
  const { data: globalPrompt } = useGlobalPrompt();
  const { data: settings } = useSettings();
  const { data: workflow } = useWorkflow();
  const { state: connectionState } = useHeaderConnectionState();
  const createMutation = useCreateGeneration();

  const activeStyles = useMemo(() => (styles ?? []).filter((s) => s.isActive), [styles]);

  const [idea, setIdea] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [images, setImages] = useState<ImageRowState[]>([]);
  const [advanced, setAdvanced] = useState<AdvancedSettingsState>({
    width: 1024,
    height: 1024,
    steps: 25,
    cfg: 4,
    seedMode: "random",
    fixedSeed: "",
    incrementFixedSeed: true,
    sampler: "",
    scheduler: "",
  });
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // Sync editable defaults from settings whenever a (re)fetch brings a new
  // object -- same once-per-load-or-refetch behavior as a settings-synced effect.
  const [syncedSettings, setSyncedSettings] = useState(settings);
  if (settings !== syncedSettings) {
    setSyncedSettings(settings);
    if (settings) {
      setAdvanced((prev) => ({
        ...prev,
        width: settings.defaultWidth,
        height: settings.defaultHeight,
        steps: settings.defaultSteps,
        cfg: settings.defaultCfg,
        seedMode: settings.defaultSeedMode,
        fixedSeed: settings.defaultFixedSeed?.toString() ?? "",
      }));
    }
  }

  // Keep the per-image rows in sync with imageCount (grow/shrink, keeping
  // existing rows' style/notes) and backfill a default style once active
  // styles finish loading, without clobbering rows the user already edited.
  const stylesReady = activeStyles.length > 0;
  const [prevImageCount, setPrevImageCount] = useState(-1);
  const [prevStylesReady, setPrevStylesReady] = useState(false);
  if (imageCount !== prevImageCount || stylesReady !== prevStylesReady) {
    setPrevImageCount(imageCount);
    setPrevStylesReady(stylesReady);
    const defaultStyleId = activeStyles[0]?.id ?? "";
    setImages((prev) => {
      if (imageCount > prev.length) {
        return [...prev, ...Array.from({ length: imageCount - prev.length }, () => makeRow(defaultStyleId))];
      }
      if (imageCount < prev.length) {
        return prev.slice(0, imageCount);
      }
      if (stylesReady && !prevStylesReady) {
        return prev.map((row) => (row.styleId ? row : { ...row, styleId: defaultStyleId }));
      }
      return prev;
    });
  }

  const maxImages = settings?.maxImagesPerBatch ?? 8;
  const workflowReady = Boolean(workflow?.configured && workflow.isValidated);
  const hasStyles = activeStyles.length > 0;
  const allRowsHaveStyle = images.length > 0 && images.every((row) => row.styleId);
  const canSubmit =
    idea.trim().length > 0 &&
    connectionState === "connected" &&
    workflowReady &&
    hasStyles &&
    allRowsHaveStyle &&
    !createMutation.isPending;

  function handleCountChange(next: number) {
    const clamped = Math.max(1, Math.min(maxImages, next));
    setImageCount(clamped);
  }

  function handleSubmit() {
    createMutation.mutate(
      {
        idea: idea.trim(),
        images: images.map((row) => ({
          styleId: row.styleId,
          positiveOverride: row.positiveOverride || undefined,
          negativeOverride: row.negativeOverride || undefined,
        })),
        width: advanced.width,
        height: advanced.height,
        steps: advanced.steps,
        cfg: advanced.cfg,
        sampler: advanced.sampler || undefined,
        scheduler: advanced.scheduler || undefined,
        seedMode: advanced.seedMode,
        fixedSeed: advanced.fixedSeed ? Number(advanced.fixedSeed) : undefined,
        incrementFixedSeed: advanced.incrementFixedSeed,
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
      {!workflow?.configured && (
        <Alert variant="destructive">
          <AlertTitle>Chưa cấu hình workflow</AlertTitle>
          <AlertDescription>Vào Cài đặt để import workflow ComfyUI trước khi tạo ảnh.</AlertDescription>
        </Alert>
      )}
      {workflow?.configured && !workflow.isValidated && (
        <Alert variant="destructive">
          <AlertTitle>Workflow chưa được validate</AlertTitle>
          <AlertDescription>Vào Cài đặt, cấu hình node mapping rồi bấm &quot;Validate mapping&quot;.</AlertDescription>
        </Alert>
      )}
      {connectionState !== "connected" && (
        <Alert variant="destructive">
          <AlertTitle>Chưa kết nối ComfyUI</AlertTitle>
          <AlertDescription>Vào Cài đặt để nhập URL tunnel và kiểm tra kết nối.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <Label htmlFor="idea">Bạn muốn tạo ảnh gì?</Label>
          <Textarea
            id="idea"
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Một cô gái tóc xanh đứng trong khu vườn ngập nắng, mặc trang phục phong cách anime."
          />
          <p className="text-xs text-muted-foreground">
            Mô tả bằng tiếng Việt hoặc tiếng Anh. Bạn có thể xem và chỉnh prompt đầy đủ trước khi tạo.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Label htmlFor="image-count" className="shrink-0">Số lượng ảnh</Label>
        <Input
          id="image-count"
          type="number"
          min={1}
          max={maxImages}
          value={imageCount}
          onChange={(e) => handleCountChange(Number(e.target.value))}
          className="w-24"
        />
        <span className="text-xs text-muted-foreground">Tối đa {maxImages} ảnh/lần</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {images.map((row, index) => (
          <ImageConfigCard
            key={row.localId}
            index={index}
            value={row}
            onChange={(next) => setImages((prev) => prev.map((r) => (r.localId === row.localId ? next : r)))}
            activeStyles={activeStyles}
            idea={idea}
            globalPrompt={globalPrompt}
          />
        ))}
      </div>

      <AdvancedSettings value={advanced} onChange={setAdvanced} mapping={workflow?.mapping} />

      <div className="flex items-center justify-between rounded-md border bg-background p-4">
        <p className="text-sm text-muted-foreground">
          Sẽ tạo <span className="font-medium text-foreground">{images.length}</span> ảnh
          {activeStyles.length > 0 && images.length === 1 ? ` với style "${activeStyles.find((s) => s.id === images[0]?.styleId)?.name ?? ""}"` : ""}.
        </p>
        <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
          <Sparkles className="h-4 w-4" />
          {createMutation.isPending ? "Đang gửi..." : "Tạo ảnh"}
        </Button>
      </div>
    </div>
  );
}
