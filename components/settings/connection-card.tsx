"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useConnectionTest } from "@/hooks/use-connection";
import type { ConnectionTestResponse } from "@/lib/types";

export function ConnectionCard() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const testMutation = useConnectionTest();

  const [endpointId, setEndpointId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [lastResult, setLastResult] = useState<ConnectionTestResponse | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<typeof settings>(undefined);

  const hasUnsavedChanges =
    endpointId !== (settings?.runpodEndpointId ?? "") || Boolean(apiKey);

  if (settings !== syncedSettings) {
    setSyncedSettings(settings);
    if (settings) {
      setEndpointId(settings.runpodEndpointId ?? "");
      setApiKey("");
    }
  }

  function handleTest() {
    testMutation.mutate(
      {
        endpointId: endpointId || undefined,
        apiKey: apiKey || undefined,
      },
      {
        onSuccess: (result) => {
          setLastResult(result);
          if (result.state === "connected") {
            toast.success("Kết nối RunPod thành công");
          } else {
            toast.error(result.error?.message ?? "Không kết nối được");
          }
        },
        onError: () => toast.error("Không kết nối được tới RunPod"),
      },
    );
  }

  function handleSave() {
    updateSettings.mutate(
      {
        runpodEndpointId: endpointId,
        runpodApiKey: apiKey || undefined,
      },
      {
        onSuccess: () => {
          setApiKey("");
          toast.success("Đã lưu cấu hình RunPod");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Lưu thất bại"),
      },
    );
  }

  function handleClear() {
    setEndpointId("");
    setApiKey("");
    setLastResult(null);
    updateSettings.mutate(
      { runpodEndpointId: null, runpodApiKey: null },
      {
        onSuccess: () => {
          toast.success("Đã xóa cấu hình RunPod");
        },
      },
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-10 w-full" /></CardContent>
      </Card>
    );
  }

  const isConfiguredOrHasInput = Boolean(endpointId || settings?.runpodEndpointId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kết nối GPU (RunPod Serverless)</CardTitle>
        <CardDescription>
          GPU tự bật khi có yêu cầu và tự tắt khi rảnh. Lần đầu có thể mất 1–2 phút để khởi động.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="endpoint-id">Endpoint ID</Label>
          <Input
            id="endpoint-id"
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
            placeholder="vd: vllm-xxxxxx hoặc xxxxxxxxxx"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key">RunPod API Key</Label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              settings?.hasRunpodKey ? "Đã lưu — để trống nếu không đổi" : "rpa_xxxx..."
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleTest} disabled={testMutation.isPending || !isConfiguredOrHasInput}>
            {testMutation.isPending ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={updateSettings.isPending || !hasUnsavedChanges}
          >
            Lưu
          </Button>
          <Button
            variant="ghost"
            onClick={handleClear}
            disabled={!settings?.runpodEndpointId && !settings?.hasRunpodKey}
          >
            Xóa cấu hình
          </Button>
          {hasUnsavedChanges && (
            <Badge variant="destructive" className="ml-1">
              Có thay đổi chưa lưu — bấm &quot;Lưu&quot; trước khi rời trang
            </Badge>
          )}
        </div>

        {lastResult && (
          <div
            className={
              lastResult.state === "connected"
                ? "flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
                : "flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            }
          >
            {lastResult.state === "connected" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              {lastResult.state === "connected" ? (
                <>
                  <p className="font-medium">
                    Đã kết nối — worker: {lastResult.workers?.idle ?? 0} rảnh, {lastResult.workers?.running ?? 0} đang chạy; job chờ: {lastResult.jobs?.inQueue ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Kiểm tra lúc {new Date(lastResult.checkedAt).toLocaleTimeString("vi-VN")}
                  </p>
                </>
              ) : (
                <p className="font-medium">
                  Không kết nối được: {lastResult.error?.message ?? "Lỗi không xác định"}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
