"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { FileJson, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteWorkflow, useImportWorkflow, useWorkflow } from "@/hooks/use-workflow";

export function WorkflowCard() {
  const { data, isLoading } = useWorkflow();
  const importMutation = useImportWorkflow();
  const deleteMutation = useDeleteWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    importMutation.mutate(file, {
      onSuccess: () => toast.success("Đã import workflow"),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Import thất bại"),
      onSettled: () => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  }

  function handleDelete() {
    deleteMutation.mutate(undefined, {
      onSuccess: () => toast.success("Đã xóa workflow hiện tại"),
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-10 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow ComfyUI (API Format)</CardTitle>
        <CardDescription>
          Xuất workflow từ ComfyUI bằng &quot;Save (API Format)&quot; rồi import file JSON vào đây.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.configured ? (
          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="flex items-start gap-3">
              <FileJson className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">{data.originalFilename}</p>
                <p className="text-xs text-muted-foreground">
                  {data.nodeCount} node · nhập lúc{" "}
                  {data.importedAt ? new Date(data.importedAt).toLocaleString("vi-VN") : "—"}
                </p>
                <p className="text-xs">
                  {data.isValidated ? (
                    <span className="text-emerald-700">Mapping đã được validate</span>
                  ) : (
                    <span className="text-amber-700">Chưa validate mapping</span>
                  )}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" /> Xóa
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa cấu hình workflow. Trang Tạo ảnh sẽ không hoạt động.</p>
        )}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
            <Upload className="h-4 w-4" />
            {importMutation.isPending ? "Đang import..." : data?.configured ? "Thay workflow khác" : "Import workflow JSON"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
