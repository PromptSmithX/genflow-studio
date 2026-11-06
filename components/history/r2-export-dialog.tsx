"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  CloudUpload,
  Loader2,
  Download,
  Folder,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useR2Status,
  useR2Test,
  useR2Candidates,
  usePushR2,
  type R2CandidateItem,
} from "@/hooks/use-r2";
import { apiPost } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export function R2ExportDialog() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const statusQuery = useR2Status();
  const testMutation = useR2Test();
  const candidatesQuery = useR2Candidates(open);
  const pushMutation = usePushR2();

  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);

  // Lọc theo title hoặc SKU
  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const matchTitle = (c.etsyTitle ?? "").toLowerCase().includes(q);
      const matchSku = (c.r2SkuBase ?? "").toLowerCase().includes(q);
      return matchTitle || matchSku;
    });
  }, [candidates, search]);

  const eligibleInFiltered = useMemo(() => {
    return filteredCandidates.filter((c) => c.eligible);
  }, [filteredCandidates]);

  const isAllEligibleSelected =
    eligibleInFiltered.length > 0 &&
    eligibleInFiltered.every((c) => selectedIds.has(c.id));

  function handleToggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllEligibleSelected) {
        eligibleInFiltered.forEach((c) => next.delete(c.id));
      } else {
        eligibleInFiltered.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function handleToggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleConfirmPush() {
    if (selectedIds.size === 0) return;
    pushMutation.mutate([...selectedIds], {
      onSuccess: (data) => {
        const hasFailed = data.results.some((r) => !r.ok);
        if (hasFailed) {
          toast.warning("Một số bộ lịch đẩy lên R2 thất bại");
        } else {
          toast.success("Đã hoàn tất đẩy ảnh lên Cloudflare R2!");
        }
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Đẩy R2 thất bại");
      },
    });
  }

  function handleOpenFolder() {
    apiPost("/api/r2/exports/reveal")
      .then(() => toast.success("Đang mở thư mục exports trên máy"))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Không mở được thư mục"));
  }

  function handleDownloadCsv(filename: string) {
    window.open(`/api/r2/exports/${encodeURIComponent(filename)}`, "_blank");
  }

  function handleReset() {
    pushMutation.reset();
    setSelectedIds(new Set());
    setSearch("");
  }

  const isConfigured = statusQuery.data?.configured ?? false;
  const isTesting = testMutation.isPending;
  const testConnection = testMutation.data?.connection;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          handleReset();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <CloudUpload className="mr-1.5 h-4 w-4" /> Đẩy R2 + xuất CSV
          </Button>
        }
      />

      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-xl">Đẩy Cloudflare R2 + Xuất CSV Printify</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Tải 14 ảnh (2 khổ × 2 bản) + 5 preview lên R2 công khai và xuất file CSV Printify.
              </DialogDescription>
            </div>

            {/* R2 status badge & test button */}
            <div className="flex items-center gap-2">
              {statusQuery.isLoading ? (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Đang kiểm tra env...
                </Badge>
              ) : !isConfigured ? (
                <Badge variant="destructive" className="text-xs">
                  Thiếu biến môi trường: {statusQuery.data?.missing.join(", ")}
                </Badge>
              ) : isTesting ? (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Đang kết nối...
                </Badge>
              ) : testConnection === "ok" ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Kết nối R2 tốt
                </Badge>
              ) : testConnection === "error" ? (
                <Badge variant="destructive" className="text-xs">
                  Kết nối lỗi: {testMutation.data?.error}
                </Badge>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
                  Đã cấu hình
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => testMutation.mutate()}
                disabled={isTesting || !isConfigured}
              >
                <RefreshCw className={cn("mr-1 h-3 w-3", isTesting && "animate-spin")} />
                Kiểm tra kết nối
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {pushMutation.isPending ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-base font-medium">
                Đang đẩy {selectedIds.size} bộ (có thể mất vài phút)...
              </p>
              <p className="text-xs text-muted-foreground">
                App đang upscale 2 khổ in (11x8.5 và 14x11.5), tải 61 đối tượng mỗi bộ lên Cloudflare R2 và tạo CSV.
              </p>
            </div>
          ) : pushMutation.data ? (
            /* Bảng kết quả sau khi đẩy */
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                <h4 className="font-semibold text-sm">Kết quả đẩy R2:</h4>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ Thành công: {pushMutation.data.results.filter((r) => r.ok).length} bộ
                  </span>
                  {pushMutation.data.results.some((r) => !r.ok) && (
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      ✗ Lỗi: {pushMutation.data.results.filter((r) => !r.ok).length} bộ
                    </span>
                  )}
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch ID / SKU</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Chi tiết</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pushMutation.data.results.map((res) => {
                      const candidate = candidates.find((c) => c.id === res.batchId);
                      return (
                        <TableRow key={res.batchId}>
                          <TableCell className="font-mono text-xs">
                            <div className="font-semibold">{res.skuBase || res.batchId}</div>
                            {candidate?.etsyTitle && (
                              <div className="font-sans text-muted-foreground line-clamp-1">
                                {candidate.etsyTitle}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {res.ok ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Thành công
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Lỗi</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {res.error || "61 đối tượng tải lên hoàn tất"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* CSV download & reveal */}
              {pushMutation.data.csvFileName && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div className="text-sm">
                    <p className="font-medium">File CSV Printify đã sẵn sàng:</p>
                    <p className="font-mono text-xs text-muted-foreground">{pushMutation.data.csvFileName}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleDownloadCsv(pushMutation.data!.csvFileName!)}
                    >
                      <Download className="mr-1.5 h-4 w-4" /> Tải CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                      <Folder className="mr-1.5 h-4 w-4" /> Mở thư mục
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Danh sách chọn bộ lịch */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-xs"
                    placeholder="Tìm theo Etsy title hoặc SKU..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleToggleSelectAll}
                  disabled={eligibleInFiltered.length === 0}
                >
                  {isAllEligibleSelected ? "Bỏ chọn tất cả" : "Chọn tất cả bộ hợp lệ"}
                </Button>
              </div>

              {candidatesQuery.isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Đang tải danh sách bộ lịch...
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  {search ? "Không tìm thấy bộ lịch nào khớp." : "Chưa có bộ lịch nào."}
                </div>
              ) : (
                <div className="border rounded-md divide-y max-h-[380px] overflow-y-auto">
                  {filteredCandidates.map((candidate: R2CandidateItem) => {
                    const isSelected = selectedIds.has(candidate.id);
                    return (
                      <div
                        key={candidate.id}
                        className={cn(
                          "flex items-center gap-3 p-3 transition-colors",
                          !candidate.eligible
                            ? "opacity-60 bg-muted/20"
                            : isSelected
                              ? "bg-accent/40"
                              : "hover:bg-muted/30",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer disabled:cursor-not-allowed"
                          checked={isSelected}
                          disabled={!candidate.eligible}
                          title={!candidate.eligible ? candidate.reason : undefined}
                          onChange={() => handleToggleOne(candidate.id)}
                        />

                        {/* Thumbnail */}
                        <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded border bg-muted">
                          {candidate.coverImageId ? (
                            <Image
                              src={`/api/images/${candidate.coverImageId}`}
                              alt=""
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                              Bìa
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="font-medium text-xs line-clamp-1">
                            {candidate.etsyTitle || "Bộ lịch không có Etsy title"}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{new Date(candidate.createdAt).toLocaleString("vi-VN")}</span>
                            {candidate.r2SkuBase && (
                              <>
                                <span>·</span>
                                <span className="font-mono text-primary font-medium">
                                  {candidate.r2SkuBase}
                                </span>
                              </>
                            )}
                          </div>
                          {!candidate.eligible && (
                            <p className="text-[11px] text-destructive flex items-center gap-1">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {candidate.reason}
                            </p>
                          )}
                        </div>

                        {/* R2 status badge */}
                        <div className="shrink-0 text-right">
                          {candidate.r2Status === "done" ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            >
                              Đã đẩy {candidate.r2PushedAt ? new Date(candidate.r2PushedAt).toLocaleDateString("vi-VN") : ""}
                            </Badge>
                          ) : candidate.r2Status === "failed" ? (
                            <Badge variant="destructive" className="text-[10px]" title={candidate.r2Error || ""}>
                              Lỗi
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Chưa đẩy</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t flex items-center justify-between sm:justify-between">
          {pushMutation.data ? (
            <div className="flex w-full justify-between items-center">
              <Button variant="outline" size="sm" onClick={handleReset}>
                Quay lại danh sách
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Đóng
              </Button>
            </div>
          ) : (
            <div className="flex w-full justify-between items-center">
              <div className="text-xs text-muted-foreground">
                Đã chọn: <span className="font-semibold text-foreground">{selectedIds.size}</span> bộ
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={pushMutation.isPending}
                >
                  Hủy
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmPush}
                  disabled={
                    selectedIds.size === 0 ||
                    !isConfigured ||
                    pushMutation.isPending
                  }
                >
                  {pushMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Đang đẩy...
                    </>
                  ) : (
                    `Xác nhận đẩy (${selectedIds.size})`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
