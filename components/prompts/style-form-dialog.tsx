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
import { useCreateStyle, useUpdateStyle } from "@/hooks/use-styles";
import type { StyleDTO } from "@/lib/types";
import { ApiRequestError } from "@/lib/client/api";

interface StyleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  style?: StyleDTO | null;
  duplicateFrom?: StyleDTO | null;
}

export function StyleFormDialog({ open, onOpenChange, style, duplicateFrom }: StyleFormDialogProps) {
  const source = style ?? duplicateFrom ?? null;
  const isEditing = Boolean(style);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [positivePrompt, setPositivePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateStyle();
  const updateMutation = useUpdateStyle();
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
      setError("Tên style không được để trống");
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

    if (isEditing && style) {
      updateMutation.mutate(
        { id: style.id, input },
        { onSuccess: () => { toast.success("Đã lưu style"); onOpenChange(false); }, onError },
      );
    } else {
      createMutation.mutate(input, {
        onSuccess: () => { toast.success("Đã tạo style"); onOpenChange(false); },
        onError,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Sửa style" : duplicateFrom ? "Nhân bản style" : "Tạo style mới"}</DialogTitle>
          <DialogDescription>Style là dữ liệu có thể dùng ngay ở trang Tạo ảnh.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="style-name">Tên style</Label>
            <Input id="style-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Anime Cinematic" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="style-description">Mô tả ngắn</Label>
            <Input
              id="style-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Phong cách anime điện ảnh, ánh sáng kịch tính"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="style-positive">Positive prompt của style</Label>
            <Textarea
              id="style-positive"
              value={positivePrompt}
              onChange={(e) => setPositivePrompt(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="style-negative">Negative prompt của style (tùy chọn)</Label>
            <Textarea
              id="style-negative"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="style-active" className="cursor-pointer">
              Hoạt động (hiện ở trang Tạo ảnh)
            </Label>
            <Switch id="style-active" checked={isActive} onCheckedChange={setIsActive} />
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
