"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buildPrompts } from "@/lib/prompts/build-prompts";
import type { StyleDTO, GlobalPromptDTO } from "@/lib/types";

export interface ImageRowState {
  localId: string;
  styleId: string;
  positiveOverride: string;
  negativeOverride: string;
}

interface ImageConfigCardProps {
  index: number;
  value: ImageRowState;
  onChange: (next: ImageRowState) => void;
  activeStyles: StyleDTO[];
  idea: string;
  globalPrompt: GlobalPromptDTO | undefined;
}

export function ImageConfigCard({ index, value, onChange, activeStyles, idea, globalPrompt }: ImageConfigCardProps) {
  const selectedStyle = activeStyles.find((s) => s.id === value.styleId);

  const preview = buildPrompts({
    globalPositive: globalPrompt?.positivePrompt ?? "",
    globalNegative: globalPrompt?.negativePrompt ?? "",
    idea,
    stylePositive: selectedStyle?.positivePrompt ?? "",
    styleNegative: selectedStyle?.negativePrompt ?? "",
    imagePositiveOverride: value.positiveOverride,
    imageNegativeOverride: value.negativeOverride,
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Ảnh {index + 1}</h3>
        </div>

        <div className="space-y-2">
          <Label>Style</Label>
          {activeStyles.length === 0 ? (
            <p className="text-sm text-amber-700">
              Chưa có style nào đang hoạt động. Vào <span className="font-medium">Thư viện prompt</span> để tạo style.
            </p>
          ) : (
            <Select
              value={value.styleId || undefined}
              onValueChange={(styleId) => {
                if (typeof styleId === "string") onChange({ ...value, styleId });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn style" />
              </SelectTrigger>
              <SelectContent>
                {activeStyles.map((style) => (
                  <SelectItem key={style.id} value={style.id}>
                    {style.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Chi tiết riêng cho ảnh này (tùy chọn)</Label>
          <Textarea
            rows={2}
            value={value.positiveOverride}
            onChange={(e) => onChange({ ...value, positiveOverride: e.target.value })}
            placeholder="Ví dụ: đang mỉm cười, ánh hoàng hôn"
          />
        </div>

        <Accordion>
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-sm">Negative riêng cho ảnh này (nâng cao)</AccordionTrigger>
            <AccordionContent>
              <Textarea
                rows={2}
                value={value.negativeOverride}
                onChange={(e) => onChange({ ...value, negativeOverride: e.target.value })}
                placeholder="Các chi tiết muốn tránh chỉ riêng cho ảnh này"
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="preview">
            <AccordionTrigger className="text-sm">Xem prompt sẽ dùng</AccordionTrigger>
            <AccordionContent className="space-y-2 text-xs">
              <div>
                <p className="font-medium text-foreground">Prompt chung</p>
                <p className="text-muted-foreground">
                  {preview.parts.positive.global || "—"} {preview.parts.positive.idea && `/ ${preview.parts.positive.idea}`}
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">Phong cách</p>
                <p className="text-muted-foreground">{preview.parts.positive.style || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Chi tiết riêng</p>
                <p className="text-muted-foreground">{preview.parts.positive.override || "—"}</p>
              </div>
              <div className="border-t pt-2">
                <p className="font-medium text-foreground">Positive final</p>
                <p className="text-muted-foreground">{preview.positiveFinal || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Negative final</p>
                <p className="text-muted-foreground">{preview.negativeFinal || "—"}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
