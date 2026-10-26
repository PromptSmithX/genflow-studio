"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

export function DefaultsCard() {
  const { data, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState({
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultSteps: 25,
    defaultCfg: 4,
    defaultSeedMode: "random" as "random" | "fixed",
    defaultFixedSeed: "" as string | number,
    maxImagesPerBatch: 8,
    outputDirectory: "data/outputs",
  });

  useEffect(() => {
    if (data) {
      setForm({
        defaultWidth: data.defaultWidth,
        defaultHeight: data.defaultHeight,
        defaultSteps: data.defaultSteps,
        defaultCfg: data.defaultCfg,
        defaultSeedMode: data.defaultSeedMode,
        defaultFixedSeed: data.defaultFixedSeed ?? "",
        maxImagesPerBatch: data.maxImagesPerBatch,
        outputDirectory: data.outputDirectory,
      });
    }
  }, [data]);

  function handleSave() {
    updateMutation.mutate(
      {
        defaultWidth: form.defaultWidth,
        defaultHeight: form.defaultHeight,
        defaultSteps: form.defaultSteps,
        defaultCfg: form.defaultCfg,
        defaultSeedMode: form.defaultSeedMode,
        defaultFixedSeed: form.defaultFixedSeed === "" ? null : Number(form.defaultFixedSeed),
        maxImagesPerBatch: form.maxImagesPerBatch,
        outputDirectory: form.outputDirectory,
      },
      {
        onSuccess: () => toast.success("Đã lưu thông số mặc định"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Lưu thất bại"),
      },
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông số tạo ảnh mặc định</CardTitle>
        <CardDescription>Áp dụng cho batch mới trừ khi được chỉnh riêng ở trang Tạo ảnh.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label>Width</Label>
            <Input type="number" value={form.defaultWidth} onChange={(e) => setForm((f) => ({ ...f, defaultWidth: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Height</Label>
            <Input type="number" value={form.defaultHeight} onChange={(e) => setForm((f) => ({ ...f, defaultHeight: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Steps</Label>
            <Input type="number" value={form.defaultSteps} onChange={(e) => setForm((f) => ({ ...f, defaultSteps: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>CFG</Label>
            <Input type="number" step="0.1" value={form.defaultCfg} onChange={(e) => setForm((f) => ({ ...f, defaultCfg: Number(e.target.value) }))} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Seed mode mặc định</Label>
            <Select value={form.defaultSeedMode} onValueChange={(v) => setForm((f) => ({ ...f, defaultSeedMode: v as "random" | "fixed" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Ngẫu nhiên cho từng ảnh</SelectItem>
                <SelectItem value="fixed">Dùng seed cố định</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.defaultSeedMode === "fixed" && (
            <div className="space-y-2">
              <Label>Seed cố định</Label>
              <Input
                type="number"
                value={form.defaultFixedSeed}
                onChange={(e) => setForm((f) => ({ ...f, defaultFixedSeed: e.target.value }))}
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Số ảnh tối đa mỗi lần tạo</Label>
            <Input
              type="number"
              min={1}
              max={8}
              value={form.maxImagesPerBatch}
              onChange={(e) => setForm((f) => ({ ...f, maxImagesPerBatch: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Thư mục lưu ảnh</Label>
            <Input
              value={form.outputDirectory}
              onChange={(e) => setForm((f) => ({ ...f, outputDirectory: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Đang lưu..." : "Lưu thành mặc định"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
