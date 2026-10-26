"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalPrompt, useUpdateGlobalPrompt } from "@/hooks/use-global-prompt";

export function GlobalPromptCard() {
  const { data, isLoading } = useGlobalPrompt();
  const updateMutation = useUpdateGlobalPrompt();

  const [positive, setPositive] = useState("");
  const [negative, setNegative] = useState("");
  const [syncedData, setSyncedData] = useState(data);

  if (data !== syncedData) {
    setSyncedData(data);
    if (data) {
      setPositive(data.positivePrompt);
      setNegative(data.negativePrompt);
    }
  }

  const isDirty = data && (positive !== data.positivePrompt || negative !== data.negativePrompt);

  function handleSave() {
    updateMutation.mutate(
      { positivePrompt: positive, negativePrompt: negative },
      {
        onSuccess: () => toast.success("Đã lưu prompt mặc định"),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Lưu thất bại"),
      },
    );
  }

  function handleCancel() {
    if (data) {
      setPositive(data.positivePrompt);
      setNegative(data.negativePrompt);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt mặc định</CardTitle>
        <CardDescription>
          Áp dụng cho mọi ảnh được tạo. Cập nhật gần nhất:{" "}
          {data ? new Date(data.updatedAt).toLocaleString("vi-VN") : "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="global-positive">Positive prompt mặc định</Label>
          <Textarea
            id="global-positive"
            value={positive}
            onChange={(e) => setPositive(e.target.value)}
            rows={3}
            placeholder="Ví dụ: ảnh chất lượng cao, chi tiết sắc nét"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="global-negative">Negative prompt mặc định</Label>
          <Textarea
            id="global-negative"
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            rows={3}
            placeholder="Ví dụ: blurry, low quality, malformed anatomy, extra fingers, watermark, unwanted text"
          />
          <p className="text-xs text-muted-foreground">
            Đây chỉ là gợi ý mẫu, bạn có thể xóa hoàn toàn nếu không cần.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={!isDirty || updateMutation.isPending}>
            Hủy thay đổi
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || updateMutation.isPending}>
            {updateMutation.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
