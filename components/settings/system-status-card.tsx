"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useR2Status } from "@/hooks/use-r2";
import { useSheetsStatus } from "@/hooks/use-sheets";
import { Check, AlertTriangle, Cloud, Table } from "lucide-react";

export function SystemStatusCard() {
  const { data: r2Status } = useR2Status();
  const { data: sheetsStatus } = useSheetsStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trạng thái hệ thống</CardTitle>
        <CardDescription>
          Kiểm tra kết nối và cấu hình các dịch vụ lưu trữ đám mây và bảng tính.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
