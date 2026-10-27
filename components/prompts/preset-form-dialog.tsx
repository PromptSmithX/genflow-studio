"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiRequestError } from "@/lib/client/api";
import type { PresetDTO, PresetHooks, PresetLabels } from "@/components/prompts/preset-types";

interface PresetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset?: PresetDTO | null;
  duplicateFrom?: PresetDTO | null;
  hooks: PresetHooks;
  labels: PresetLabels;
}

export function PresetFormDialog({ open, onOpenChange, preset, duplicateFrom, hooks, labels }: PresetFormDialogProps) {
  const source = preset ?? duplicateFrom ?? null;
  const isEditing = Boolean(preset);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [positivePrompt, setPositivePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createMutation = hooks.useCreate();
  const updateMutation = hooks.useUpdate();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(duplicateFrom ? `${duplicateFrom.name} (bản sao)` : source?.name ?? "");
      setDescription(source?.description ?? "");
      setPositivePrompt(source?.positivePrompt ?? "");
      setNegativePrompt(source?.negativePrompt ?? "");
      setIsActive(source?.isActive ?? true);
      setError(null);
    }
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(`Tên ${labels.noun} không được để trống`);
      return;
    }

    const input = { name: name.trim(), description: description.trim() || null, positivePrompt, negativePrompt, isActive };

    const onError = (err: unknown) => {
      if (err instanceof ApiRequestError && err.code === "duplicate_name") {
        setError(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
    };

    if (isEditing && preset) {
      updateMutation.mutate(
        { id: preset.id, input },
        { onSuccess: () => { toast.success(`Đã lưu ${labels.noun}`); onOpenChange(false); }, onError },
      );
    } else {
      createMutation.mutate(input, {
        onSuccess: () => { toast.success(`Đã tạo ${labels.noun}`); onOpenChange(false); },
        onError,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Sửa ${labels.noun}` : duplicateFrom ? `Nhân bản ${labels.noun}` : `Tạo ${labels.noun} mới`}
          </DialogTitle>
          <DialogDescription>Dữ liệu này có thể dùng ngay ở trang Tạo ảnh.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="preset-name">Tên {labels.noun}</Label>
            <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={labels.namePlaceholder} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-description">Mô tả ngắn</Label>
            <Input
              id="preset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={labels.descriptionPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-positive">Positive prompt</Label>
            <Textarea
              id="preset-positive"
              value={positivePrompt}
              onChange={(e) => setPositivePrompt(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-negative">Negative prompt (tùy chọn)</Label>
            <Textarea
              id="preset-negative"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="preset-active" className="cursor-pointer">
              Hoạt động (hiện ở trang Tạo ảnh)
            </Label>
            <Switch id="preset-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
