"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { toast } from "sonner";

export function AdvancedModeCard() {
  const { data: settings } = useSettings();
  const updateMutation = useUpdateSettings();

  const advancedMode = settings?.advancedMode ?? false;

  function handleToggle(checked: boolean) {
    updateMutation.mutate(
      { advancedMode: checked },
      {
        onSuccess: () => {
          toast.success(checked ? "Đã bật Chế độ nâng cao" : "Đã tắt Chế độ nâng cao");
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Cập nhật thất bại");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chế độ nâng cao</CardTitle>
        <CardDescription>
          Hiển thị toàn bộ các nút điều khiển thủ công, thông số tạo ảnh chi tiết và cấu hình hệ thống.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="advanced-mode-toggle" className="text-base font-medium">
              Chế độ nâng cao
            </Label>
            <p className="text-sm text-muted-foreground">
              Mặc định tắt để ẩn toàn bộ các nút điều khiển thủ công và giữ giao diện đơn giản nhất.
            </p>
          </div>
          <Switch
            id="advanced-mode-toggle"
            checked={advancedMode}
            disabled={updateMutation.isPending}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
