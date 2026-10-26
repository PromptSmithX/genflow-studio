"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageConfigCard, type ImageRowState } from "@/components/create/image-config-card";
import { AdvancedSettings, type AdvancedSettingsState } from "@/components/create/advanced-settings";
import { BatchTracker } from "@/components/create/batch-tracker";
import { useStyles } from "@/hooks/use-styles";
import { useScenes } from "@/hooks/use-scenes";
import { usePoses } from "@/hooks/use-poses";
import { useGlobalPrompt } from "@/hooks/use-global-prompt";
import { useSettings } from "@/hooks/use-settings";
import { useWorkflow } from "@/hooks/use-workflow";
import { useHeaderConnectionState } from "@/hooks/use-connection";
import { useCreateGeneration } from "@/hooks/use-generations";
import { ApiRequestError } from "@/lib/client/api";

function makeLocalId() {
  return Math.random().toString(36).slice(2);
}

function makeRow(defaultSceneId: string, defaultPoseId: string): ImageRowState {
  return { localId: makeLocalId(), sceneId: defaultSceneId, poseId: defaultPoseId, positiveOverride: "", negativeOverride: "" };
}

export function CreateForm() {
  const { data: styles } = useStyles();
  const { data: scenes } = useScenes();
  const { data: poses } = usePoses();
  const { data: globalPrompt } = useGlobalPrompt();
  const { data: settings } = useSettings();
  const { data: workflow } = useWorkflow();
  const { state: connectionState } = useHeaderConnectionState();
  const createMutation = useCreateGeneration();

  const activeStyles = useMemo(() => (styles ?? []).filter((s) => s.isActive), [styles]);
  const activeScenes = useMemo(() => (scenes ?? []).filter((s) => s.isActive), [scenes]);
  const activePoses = useMemo(() => (poses ?? []).filter((p) => p.isActive), [poses]);

  const [styleId, setStyleId] = useState("");
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

  // Backfill the batch-level style once active styles finish loading.
  const defaultStyleId = activeStyles[0]?.id ?? "";
  const [prevDefaultStyleId, setPrevDefaultStyleId] = useState("");
  if (defaultStyleId !== prevDefaultStyleId) {
    setPrevDefaultStyleId(defaultStyleId);
    if (!styleId && defaultStyleId) setStyleId(defaultStyleId);
  }

  // Keep the per-image rows in sync with imageCount (grow/shrink, keeping
  // existing rows' choices) and backfill default scene/pose once those
  // libraries finish loading, without clobbering rows the user already edited.
  const defaultSceneId = activeScenes[0]?.id ?? "";
  const defaultPoseId = activePoses[0]?.id ?? "";
  const defaultsKey = `${defaultSceneId}|${defaultPoseId}`;
  const [prevImageCount, setPrevImageCount] = useState(-1);
  const [prevDefaultsKey, setPrevDefaultsKey] = useState("");
  if (imageCount !== prevImageCount || defaultsKey !== prevDefaultsKey) {
    setPrevImageCount(imageCount);
    setPrevDefaultsKey(defaultsKey);
    setImages((prev) => {
      let next = prev;
      if (imageCount > prev.length) {
        next = [...prev, ...Array.from({ length: imageCount - prev.length }, () => makeRow(defaultSceneId, defaultPoseId))];
      } else if (imageCount < prev.length) {
        next = prev.slice(0, imageCount);
      }
      return next.map((row) => ({
        ...row,
        sceneId: row.sceneId || defaultSceneId,
        poseId: row.poseId || defaultPoseId,
      }));
    });
  }

  const maxImages = settings?.maxImagesPerBatch ?? 8;
  const workflowReady = Boolean(workflow?.configured && workflow.isValidated);
  const selectedStyle = activeStyles.find((s) => s.id === styleId);
  const canSubmit =
    Boolean(styleId) &&
    connectionState === "connected" &&
    workflowReady &&
    images.length > 0 &&
    !createMutation.isPending;

  function handleCountChange(next: number) {
    const clamped = Math.max(1, Math.min(maxImages, next));
    setImageCount(clamped);
  }

  function handleSubmit() {
    createMutation.mutate(
      {
        styleId,
        images: images.map((row) => ({
          sceneId: row.sceneId || undefined,
          poseId: row.poseId || undefined,
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
          <Label htmlFor="style">Style nhân vật (áp cho tất cả ảnh)</Label>
          {activeStyles.length === 0 ? (
            <p className="text-sm text-amber-700">
              Chưa có style nào đang hoạt động. Vào <span className="font-medium">Thư viện prompt</span> để tạo style
              (khuôn mặt, kiểu tóc, vóc dáng... cố định).
            </p>
          ) : (
            <Select value={styleId || undefined} onValueChange={(v) => { if (typeof v === "string") setStyleId(v); }}>
              <SelectTrigger className="w-full sm:w-96">
                <SelectValue placeholder="Chọn style" />
              </SelectTrigger>
              <SelectContent>
                {activeStyles.map((style) => (
                  <SelectItem key={style.id} value={style.id}>
                    {style.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            Mỗi ảnh bên dưới chọn bối cảnh và tư thế riêng. Bạn có thể xem prompt đầy đủ trước khi tạo.
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
            activeScenes={activeScenes}
            activePoses={activePoses}
            style={selectedStyle}
            globalPrompt={globalPrompt}
          />
        ))}
      </div>

      <AdvancedSettings value={advanced} onChange={setAdvanced} mapping={workflow?.mapping} />

      <div className="flex items-center justify-between rounded-md border bg-background p-4">
        <p className="text-sm text-muted-foreground">
          Sẽ tạo <span className="font-medium text-foreground">{images.length}</span> ảnh
          {selectedStyle ? ` với style "${selectedStyle.name}"` : ""}.
        </p>
        <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
          <Sparkles className="h-4 w-4" />
          {createMutation.isPending ? "Đang gửi..." : "Tạo ảnh"}
        </Button>
      </div>
    </div>
  );
}
