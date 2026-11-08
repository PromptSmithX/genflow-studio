"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useCalendarFormats } from "@/hooks/use-calendar-formats";
import { useR2Status } from "@/hooks/use-r2";
import { useSheetsStatus } from "@/hooks/use-sheets";
import { Check, AlertTriangle, Cloud, Table } from "lucide-react";

export function AutoPublishCard() {
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const { data: formatsData } = useCalendarFormats();
  const formats = formatsData?.formats ?? [];

  const { data: r2Status } = useR2Status();
  const { data: sheetsStatus } = useSheetsStatus();

  const [form, setForm] = useState({
    autoPublish: true,
    autoFormatId: "premade_wall_11x8_5",
  });

  const [syncedData, setSyncedData] = useState<typeof settings>(undefined);
  if (settings !== syncedData) {
    setSyncedData(settings);
    if (settings) {
      setForm({
        autoPublish: settings.autoPublish ?? true,
        autoFormatId: settings.autoFormatId || "premade_wall_11x8_5",
      });
    }
  }

  const hasUnsavedChanges =
    Boolean(settings) &&
    (form.autoPublish !== settings!.autoPublish || form.autoFormatId !== settings!.autoFormatId);

  function handleSave() {
    updateMutation.mutate(
      {
        autoPublish: form.autoPublish,
        autoFormatId: form.autoFormatId,
      },
      {
        onSuccess: () => toast.success("Đã lưu cài đặt tự động hoá"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Lưu cài đặt thất bại"),
      },
    );
  }

  if (isLoading || !settings) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tự động xuất & đồng bộ (Auto Workflow)</CardTitle>
          <Badge variant={form.autoPublish ? "default" : "secondary"}>
            {form.autoPublish ? "Đang bật" : "Đang tắt"}
          </Badge>
        </div>
        <CardDescription>
          Tự động phóng to ảnh, ghép bìa sau, tạo mockup, đẩy lên Cloudflare R2 và ghi dữ liệu vào Google Sheets ngay sau khi sinh xong bộ lịch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="auto-publish-toggle" className="text-base font-medium">
              Bật tự động hoá trọn gói
            </Label>
            <p className="text-sm text-muted-foreground">
              Khi bật, người dùng chỉ cần bấm tạo ở trang Create — mọi bước sau sẽ tự chạy ngầm.
            </p>
          </div>
          <Switch
            id="auto-publish-toggle"
            checked={form.autoPublish}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, autoPublish: checked }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="auto-format-select">Khổ template lịch in mặc định</Label>
          <Select
            value={form.autoFormatId}
            onValueChange={(val) =>
              setForm((prev) => ({ ...prev, autoFormatId: val || "premade_wall_11x8_5" }))
            }
          >
            <SelectTrigger id="auto-format-select" className="w-full">
              <SelectValue placeholder="Chọn khổ lịch..." />
            </SelectTrigger>
            <SelectContent>
              {formats.map((fmt) => (
                <SelectItem key={fmt.id} value={fmt.id}>
                  {fmt.label || fmt.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Khổ template được dùng để tự động upscale và ghép bìa sau trong pipeline.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Trạng thái kết nối dịch vụ ngoài</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Cloudflare R2</span>
                  {r2Status?.configured ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
                      <Check className="mr-1 h-3 w-3" /> Đã cấu hình
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-xs">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Chưa cấu hình
                    </Badge>
                  )}
                </div>
                {!r2Status?.configured && r2Status?.missing && r2Status.missing.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Thiếu: {r2Status.missing.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border p-3">
              <Table className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Google Sheets</span>
                  {sheetsStatus?.configured ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
                      <Check className="mr-1 h-3 w-3" /> Đã cấu hình
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-xs">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Chưa cấu hình
                    </Badge>
                  )}
                </div>
                {!sheetsStatus?.configured && sheetsStatus?.missing && sheetsStatus.missing.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Thiếu: {sheetsStatus.missing.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
