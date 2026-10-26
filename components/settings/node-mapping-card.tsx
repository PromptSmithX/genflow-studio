"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSaveMapping, useValidateMapping, useWorkflow } from "@/hooks/use-workflow";
import type { MappableField, NodeMapping, FieldMapping } from "@/lib/comfyui/workflow-mapper";
import type { MappingValidationResponse } from "@/lib/types";

const FIELD_LABELS: Record<MappableField, string> = {
  positivePrompt: "Positive prompt",
  negativePrompt: "Negative prompt",
  seed: "Seed",
  width: "Width",
  height: "Height",
  steps: "Steps",
  cfg: "CFG",
  sampler: "Sampler",
  scheduler: "Scheduler",
  batchSize: "Batch size",
};

const REQUIRED_FIELDS: MappableField[] = ["positivePrompt"];
const FIELD_ORDER: MappableField[] = [
  "positivePrompt",
  "negativePrompt",
  "seed",
  "width",
  "height",
  "steps",
  "cfg",
  "sampler",
  "scheduler",
  "batchSize",
];

export function NodeMappingCard() {
  const { data, isLoading } = useWorkflow();
  const saveMutation = useSaveMapping();
  const validateMutation = useValidateMapping();
  const [mapping, setMapping] = useState<NodeMapping>({});
  const [validation, setValidation] = useState<MappingValidationResponse | null>(null);

  useEffect(() => {
    if (data?.mapping) setMapping(data.mapping);
  }, [data?.mapping]);

  if (isLoading) return null;
  if (!data?.configured || !data.nodes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Node mapping</CardTitle>
          <CardDescription>Import workflow trước để cấu hình mapping.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const nodes = data.nodes;

  function updateField(field: MappableField, patch: Partial<FieldMapping>) {
    setMapping((prev) => {
      const current: FieldMapping = prev[field] ?? { nodeId: "", inputKey: "", enabled: false };
      return { ...prev, [field]: { ...current, ...patch } };
    });
  }

  function handleSave() {
    saveMutation.mutate(mapping, {
      onSuccess: () => toast.success("Đã lưu node mapping"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Lưu mapping thất bại"),
    });
  }

  function handleValidate() {
    validateMutation.mutate(undefined, {
      onSuccess: (result) => {
        setValidation(result);
        if (result.valid) toast.success("Mapping hợp lệ");
        else toast.error("Mapping còn vấn đề, xem chi tiết dưới bảng");
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Node mapping</CardTitle>
        <CardDescription>
          Chọn node và input field tương ứng cho từng thông số. Chỉ node/input tồn tại trong workflow mới được
          chọn.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Dùng</TableHead>
              <TableHead>Trường</TableHead>
              <TableHead>Node</TableHead>
              <TableHead>Input key</TableHead>
              <TableHead>Giá trị hiện tại</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FIELD_ORDER.map((field) => {
              const entry = mapping[field];
              const required = REQUIRED_FIELDS.includes(field);
              const selectedNode = nodes.find((n) => n.nodeId === entry?.nodeId);
              const selectedInput = selectedNode?.inputs.find((i) => i.key === entry?.inputKey);

              return (
                <TableRow key={field}>
                  <TableCell>
                    <Switch
                      checked={entry?.enabled ?? false}
                      disabled={required}
                      onCheckedChange={(checked) => updateField(field, { enabled: checked })}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {FIELD_LABELS[field]}
                    {required && <span className="ml-1 text-xs text-destructive">*</span>}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={entry?.nodeId || undefined}
                      onValueChange={(nodeId) => {
                        if (typeof nodeId === "string") updateField(field, { nodeId, inputKey: "", enabled: true });
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Chọn node" />
                      </SelectTrigger>
                      <SelectContent>
                        {nodes.map((node) => (
                          <SelectItem key={node.nodeId} value={node.nodeId}>
                            {node.nodeId} · {node.classType}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={entry?.inputKey || undefined}
                      disabled={!selectedNode}
                      onValueChange={(inputKey) => {
                        if (typeof inputKey === "string") updateField(field, { inputKey, enabled: true });
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Chọn input" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedNode?.inputs.map((input) => (
                          <SelectItem key={input.key} value={input.key}>
                            {input.key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {selectedInput?.valuePreview ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {validation && !validation.valid && (
          <ul className="space-y-1 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {validation.issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {issue.message}
              </li>
            ))}
          </ul>
        )}
        {validation?.valid && (
          <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Mapping hợp lệ, sẵn sàng tạo ảnh.
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Đang lưu..." : "Lưu mapping"}
          </Button>
          <Button variant="outline" onClick={handleValidate} disabled={validateMutation.isPending}>
            {validateMutation.isPending ? "Đang kiểm tra..." : "Validate mapping"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
