"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useConnectionTest } from "@/hooks/use-connection";
import type { ConnectionTestResponse } from "@/lib/types";

export function ConnectionCard() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const testMutation = useConnectionTest();

  const [url, setUrl] = useState("");
  const [lastResult, setLastResult] = useState<ConnectionTestResponse | null>(null);
  const [syncedSettings, setSyncedSettings] = useState(settings);

  if (settings !== syncedSettings) {
    setSyncedSettings(settings);
    if (settings) setUrl(settings.comfyBaseUrl ?? "");
  }

  function handleTest() {
    testMutation.mutate(url || undefined, {
      onSuccess: (result) => {
        setLastResult(result);
        if (result.state === "connected") toast.success("Kết nối ComfyUI thành công");
        else toast.error(result.error?.message ?? "Không kết nối được");
      },
      onError: () => toast.error("Không kết nối được tới ComfyUI"),
    });
  }

  function handleSave() {
    updateSettings.mutate(
      { comfyBaseUrl: url },
      {
        onSuccess: () => toast.success("Đã lưu URL kết nối"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Lưu thất bại"),
      },
    );
  }

  function handleClear() {
    setUrl("");
    updateSettings.mutate(
      { comfyBaseUrl: null },
      { onSuccess: () => { setLastResult(null); toast.success("Đã xóa URL đã lưu"); } },
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kết nối ComfyUI / Colab</CardTitle>
        <CardDescription>Dán URL tunnel hiện tại từ Colab rồi kiểm tra kết nối.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="comfy-url">ComfyUI base URL</Label>
          <Input
            id="comfy-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxx.loca.lt"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleTest} disabled={testMutation.isPending || !url}>
            {testMutation.isPending ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={updateSettings.isPending || url === (settings?.comfyBaseUrl ?? "")}>
            Lưu URL
          </Button>
          <Button variant="ghost" onClick={handleClear} disabled={!settings?.comfyBaseUrl}>
            Xóa URL đã lưu
          </Button>
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
                  <p className="font-medium">Đã kết nối</p>
                  <p className="text-xs">
                    Phiên bản ComfyUI: {lastResult.version ?? "—"} · GPU: {lastResult.gpu ?? "—"}
                    {lastResult.vramFreeMb != null && lastResult.vramTotalMb != null
                      ? ` · VRAM trống: ${lastResult.vramFreeMb}/${lastResult.vramTotalMb} MB`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Kiểm tra lúc {new Date(lastResult.checkedAt).toLocaleTimeString("vi-VN")}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Không kết nối được</p>
                  <p className="text-xs">{lastResult.error?.message}</p>
                </>
              )}
            </div>
          </div>
        )}

        <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cảnh báo bảo mật</AlertTitle>
          <AlertDescription className="text-amber-800">
            LocalTunnel URL trực tiếp tới ComfyUI không có lớp đăng nhập API. Bất kỳ ai biết URL này đều có thể
            gửi tác vụ đến server của bạn. Chỉ dùng cho thử nghiệm cá nhân, không chia sẻ URL, và dừng tunnel khi
            không dùng. Đây không phải là một cơ chế bảo vệ đủ mạnh cho sử dụng thực tế/chia sẻ.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
