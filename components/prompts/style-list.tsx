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
import { useDeleteStyle, useStyles, useUpdateStyle } from "@/hooks/use-styles";
import { StyleFormDialog } from "@/components/prompts/style-form-dialog";
import type { StyleDTO } from "@/lib/types";

export function StyleList() {
  const { data: styles, isLoading } = useStyles();
  const updateMutation = useUpdateStyle();
  const deleteMutation = useDeleteStyle();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<StyleDTO | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<StyleDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StyleDTO | null>(null);

  const filtered = useMemo(() => {
    if (!styles) return [];
    const term = search.trim().toLowerCase();
    if (!term) return styles;
    return styles.filter((style) => style.name.toLowerCase().includes(term));
  }, [styles, search]);

  function openCreate() {
    setEditingStyle(null);
    setDuplicateFrom(null);
    setDialogOpen(true);
  }

  function openEdit(style: StyleDTO) {
    setEditingStyle(style);
    setDuplicateFrom(null);
    setDialogOpen(true);
  }

  function openDuplicate(style: StyleDTO) {
    setEditingStyle(null);
    setDuplicateFrom(style);
    setDialogOpen(true);
  }

  function toggleActive(style: StyleDTO, nextActive: boolean) {
    updateMutation.mutate(
      { id: style.id, input: { isActive: nextActive } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Cập nhật thất bại") },
    );
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => toast.success(`Đã xóa style "${deleteTarget.name}"`),
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
            placeholder="Tìm style theo tên..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tạo style mới
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
            {search ? "Không tìm thấy style phù hợp." : "Chưa có style nào. Tạo style mới để bắt đầu."}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((style) => (
          <Card key={style.id} className={!style.isActive ? "opacity-60" : undefined}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{style.name}</h3>
                    {!style.isActive && <Badge variant="secondary">Đã tắt</Badge>}
                  </div>
                  {style.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{style.description}</p>
                  )}
                </div>
                <Switch checked={style.isActive} onCheckedChange={(checked) => toggleActive(style, checked)} />
              </div>

              <div className="space-y-1 text-xs">
                <p className="line-clamp-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Positive: </span>
                  {style.positivePrompt || "—"}
                </p>
                {style.negativePrompt && (
                  <p className="line-clamp-2 text-muted-foreground">
                    <span className="font-medium text-foreground">Negative: </span>
                    {style.negativePrompt}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => openDuplicate(style)}>
                  <Copy className="h-3.5 w-3.5" /> Nhân bản
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(style)}>
                  <Pencil className="h-3.5 w-3.5" /> Sửa
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(style)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Xóa
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <StyleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        style={editingStyle}
        duplicateFrom={duplicateFrom}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa style &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Lịch sử các ảnh đã tạo trước đây với style này vẫn được giữ nguyên (snapshot). Hành động này không
              thể hoàn tác.
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
