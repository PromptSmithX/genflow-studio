"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Shuffle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BatchTracker } from "@/components/create/batch-tracker";
import { useStyles } from "@/hooks/use-styles";
import { useScenes } from "@/hooks/use-scenes";
import { usePoses } from "@/hooks/use-poses";
import { useSettings } from "@/hooks/use-settings";
import { useWorkflow } from "@/hooks/use-workflow";
import { useHeaderConnectionState } from "@/hooks/use-connection";
import { useCreateGeneration } from "@/hooks/use-generations";
import { buildRandomMix } from "@/lib/generations/random-mix";
import { ApiRequestError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export function QuickCreateForm() {
  const { data: styles } = useStyles();
  const { data: scenes } = useScenes();
  const { data: poses } = usePoses();
  const { data: settings } = useSettings();
  const { data: workflow } = useWorkflow();
  const { state: connectionState } = useHeaderConnectionState();
  const createMutation = useCreateGeneration();

  const activeStyles = useMemo(() => (styles ?? []).filter((s) => s.isActive), [styles]);
  const activeScenes = useMemo(() => (scenes ?? []).filter((s) => s.isActive), [scenes]);
  const activePoses = useMemo(() => (poses ?? []).filter((p) => p.isActive), [poses]);

  const [styleId, setStyleId] = useState("");
  const [imageCount, setImageCount] = useState(4);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const defaultStyleId = activeStyles[0]?.id ?? "";
  const [prevDefaultStyleId, setPrevDefaultStyleId] = useState("");
  if (defaultStyleId !== prevDefaultStyleId) {
    setPrevDefaultStyleId(defaultStyleId);
    if (!styleId && defaultStyleId) setStyleId(defaultStyleId);
  }

  const maxImages = settings?.maxImagesPerBatch ?? 8;
  const workflowReady = Boolean(workflow?.configured && workflow.isValidated);
  const isReady = connectionState === "connected" && workflowReady;
  const canSubmit = Boolean(styleId) && isReady && !createMutation.isPending;

  function handleCountChange(next: number) {
    setImageCount(Math.max(1, Math.min(maxImages, next)));
  }

  function handleSubmit() {
    const images = buildRandomMix(
      activeScenes.map((s) => s.id),
      activePoses.map((p) => p.id),
      imageCount,
    );
    createMutation.mutate(
      { styleId, images, seedMode: "random" },
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
        <h1 className="text-xl font-semibold">Tạo ảnh nhanh</h1>
        <p className="text-sm text-muted-foreground">Chọn nhân vật, chọn số lượng, ứng dụng tự phối cảnh đa dạng.</p>
      </div>

      {!isReady && (
        <Alert variant="destructive">
          <AlertTitle>Ứng dụng chưa sẵn sàng</AlertTitle>
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
            để hoàn tất.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">Chọn nhân vật</h3>
          {activeStyles.length === 0 ? (
            <p className="text-sm text-amber-700">
              Chưa có nhân vật nào. Vào <span className="font-medium">Thư viện prompt</span> để tạo.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {activeStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setStyleId(style.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                    styleId === style.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-accent",
                  )}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                    {style.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium">{style.name}</span>
                </button>
              ))}
            </div>
          )}
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

      <div className="flex items-center justify-between rounded-md border bg-background p-4">
        <p className="text-sm text-muted-foreground">
          Sẽ tạo <span className="font-medium text-foreground">{imageCount}</span> ảnh với bối cảnh và tư thế khác
          nhau, ngẫu nhiên.
        </p>
        <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
          {createMutation.isPending ? (
            <>
              <Sparkles className="h-4 w-4" /> Đang gửi...
            </>
          ) : (
            <>
              <Shuffle className="h-4 w-4" /> Tạo ngẫu nhiên
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
