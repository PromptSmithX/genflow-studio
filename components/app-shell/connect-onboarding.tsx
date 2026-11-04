"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useConnectionTest, useHeaderConnectionState } from "@/hooks/use-connection";

/**
 * A full-width banner shown on every studio page while ComfyUI isn't
 * connected -- the first thing a non-technical user needs to do each time
 * the dev hands them a fresh Colab tunnel link. Hidden once connected.
 */
export function ConnectOnboarding() {
  const { state } = useHeaderConnectionState();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const testMutation = useConnectionTest();
  const [url, setUrl] = useState("");

  if (state === "connected" || state === "checking") return null;

  function handleConnect() {
    if (!url.trim()) {
      toast.error("Dán link Colab vào ô trước khi kiểm tra");
      return;
    }
    testMutation.mutate(url, {
      onSuccess: (result) => {
        if (result.state !== "connected") {
          toast.error(result.error?.message ?? "Không kết nối được, kiểm tra lại link");
          return;
        }
        updateSettings.mutate(
          { comfyBaseUrl: url },
          {
            onSuccess: () => toast.success("Đã kết nối! Bạn có thể bắt đầu tạo ảnh."),
            onError: () => toast.error("Kết nối OK nhưng lưu link bị lỗi, thử lại"),
          },
        );
      },
      onError: () => toast.error("Không kết nối được, kiểm tra lại link"),
    });
  }

  const isBusy = testMutation.isPending || updateSettings.isPending;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-[220px] flex-1">
          <p className="text-sm font-medium text-amber-900">
            {settings?.comfyBaseUrl
              ? "Mất kết nối tới Colab — dán link mới ở đây"
              : "Dán link Colab vào đây để bắt đầu"}
          </p>
          <p className="text-xs text-amber-700">
            Lấy link từ notebook Colab đang chạy, dạng https://xxxx.trycloudflare.com hoặc
            https://xxxx.loca.lt
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxx.trycloudflare.com"
            className="bg-white sm:w-72"
          />
          <Button onClick={handleConnect} disabled={isBusy}>
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kiểm tra kết nối"}
          </Button>
        </div>
      </div>
    </div>
  );
}
