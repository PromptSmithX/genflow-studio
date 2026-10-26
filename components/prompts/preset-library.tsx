"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PresetFormDialog } from "@/components/prompts/preset-form-dialog";
import type { PresetDTO, PresetHooks, PresetLabels } from "@/components/prompts/preset-types";

interface PresetLibraryProps {
  hooks: PresetHooks;
  labels: PresetLabels;
}

export function PresetLibrary({ hooks, labels }: PresetLibraryProps) {
  const { data: presets, isLoading } = hooks.useList();
  const updateMutation = hooks.useUpdate();
  const deleteMutation = hooks.useDelete();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PresetDTO | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<PresetDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PresetDTO | null>(null);

  const filtered = useMemo(() => {
    if (!presets) return [];
    const term = search.trim().toLowerCase();
    if (!term) return presets;
    return presets.filter((preset) => preset.name.toLowerCase().includes(term));
  }, [presets, search]);

  function openCreate() {
    setEditingPreset(null);
    setDuplicateFrom(null);
    setDialogOpen(true);
  }

  function openEdit(preset: PresetDTO) {
    setEditingPreset(preset);
    setDuplicateFrom(null);
    setDialogOpen(true);
  }

  function openDuplicate(preset: PresetDTO) {
    setEditingPreset(null);
    setDuplicateFrom(preset);
    setDialogOpen(true);
  }

  function toggleActive(preset: PresetDTO, nextActive: boolean) {
    updateMutation.mutate(
      { id: preset.id, input: { ...toInput(preset), isActive: nextActive } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Cập nhật thất bại") },
    );
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => toast.success(`Đã xóa ${labels.noun} "${deleteTarget.name}"`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Xóa thất bại"),
      onSettled: () => setDeleteTarget(null),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Tìm ${labels.noun} theo tên...`}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tạo {labels.noun} mới
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {search ? `Không tìm thấy ${labels.noun} phù hợp.` : `Chưa có ${labels.noun} nào. Tạo mới để bắt đầu.`}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((preset) => (
          <Card key={preset.id} className={!preset.isActive ? "opacity-60" : undefined}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{preset.name}</h3>
                    {!preset.isActive && <Badge variant="secondary">Đã tắt</Badge>}
                  </div>
                  {preset.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{preset.description}</p>
                  )}
                </div>
                <Switch checked={preset.isActive} onCheckedChange={(checked) => toggleActive(preset, checked)} />
              </div>

              <div className="space-y-1 text-xs">
                <p className="line-clamp-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Positive: </span>
                  {preset.positivePrompt || "—"}
                </p>
                {preset.negativePrompt && (
                  <p className="line-clamp-2 text-muted-foreground">
                    <span className="font-medium text-foreground">Negative: </span>
                    {preset.negativePrompt}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => openDuplicate(preset)}>
                  <Copy className="h-3.5 w-3.5" /> Nhân bản
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(preset)}>
                  <Pencil className="h-3.5 w-3.5" /> Sửa
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(preset)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Xóa
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PresetFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preset={editingPreset}
        duplicateFrom={duplicateFrom}
        hooks={hooks}
        labels={labels}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa {labels.noun} &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Lịch sử các ảnh đã tạo trước đây với {labels.noun} này vẫn được giữ nguyên (snapshot). Hành động này
              không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toInput(preset: PresetDTO) {
  return {
    name: preset.name,
    description: preset.description,
    positivePrompt: preset.positivePrompt,
    negativePrompt: preset.negativePrompt,
    isActive: preset.isActive,
  };
}
