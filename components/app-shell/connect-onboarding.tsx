"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateSettings } from "@/hooks/use-settings";
import { useConnectionTest, useHeaderConnectionState } from "@/hooks/use-connection";

export function ConnectOnboarding() {
  const { state } = useHeaderConnectionState();
  const updateSettings = useUpdateSettings();
  const testMutation = useConnectionTest();
  const [endpointId, setEndpointId] = useState("");
  const [apiKey, setApiKey] = useState("");

  if (state === "connected" || state === "checking") return null;

  function handleConnect() {
    if (!endpointId.trim()) {
      toast.error("Nhập Endpoint ID trước khi kiểm tra");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("Nhập API Key trước khi kiểm tra");
      return;
    }
    testMutation.mutate(
      { endpointId: endpointId.trim(), apiKey: apiKey.trim() },
      {
        onSuccess: (result) => {
          if (result.state !== "connected") {
            toast.error(result.error?.message ?? "Không kết nối được, kiểm tra lại thông tin");
            return;
          }
          updateSettings.mutate(
            {
              runpodEndpointId: endpointId.trim(),
              runpodApiKey: apiKey.trim(),
            },
            {
              onSuccess: () => toast.success("Đã kết nối! Bạn có thể bắt đầu tạo ảnh."),
              onError: () => toast.error("Kết nối OK nhưng lưu cấu hình bị lỗi, thử lại"),
            },
          );
        },
        onError: () => toast.error("Không kết nối được, kiểm tra lại thông tin"),
      },
    );
  }

  const isBusy = testMutation.isPending || updateSettings.isPending;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-[220px] flex-1">
          <p className="text-sm font-medium text-amber-900">
            Nhập RunPod Endpoint ID + API Key để bắt đầu
          </p>
          <p className="text-xs text-amber-700">
            Lấy Endpoint ID và API Key từ RunPod Console (Serverless Endpoints)
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Input
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
            placeholder="Endpoint ID"
            className="bg-white sm:w-44"
          />
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="RunPod API Key"
            className="bg-white sm:w-52"
          />
          <Button onClick={handleConnect} disabled={isBusy}>
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kiểm tra kết nối"}
          </Button>
        </div>
      </div>
    </div>
  );
}
