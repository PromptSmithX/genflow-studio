"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buildPrompts } from "@/lib/prompts/build-prompts";
import type { StyleDTO, SceneDTO, PoseDTO, GlobalPromptDTO } from "@/lib/types";

export interface ImageRowState {
  localId: string;
  sceneId: string;
  poseId: string;
  positiveOverride: string;
  negativeOverride: string;
}

interface ImageConfigCardProps {
  index: number;
  value: ImageRowState;
  onChange: (next: ImageRowState) => void;
  activeScenes: SceneDTO[];
  activePoses: PoseDTO[];
  style: StyleDTO | undefined;
  globalPrompt: GlobalPromptDTO | undefined;
}

export function ImageConfigCard({ index, value, onChange, activeScenes, activePoses, style, globalPrompt }: ImageConfigCardProps) {
  const selectedScene = activeScenes.find((s) => s.id === value.sceneId);
  const selectedPose = activePoses.find((p) => p.id === value.poseId);

  const preview = buildPrompts({
    globalPositive: globalPrompt?.positivePrompt ?? "",
    globalNegative: globalPrompt?.negativePrompt ?? "",
    stylePositive: style?.positivePrompt ?? "",
    styleNegative: style?.negativePrompt ?? "",
    scenePositive: selectedScene?.positivePrompt ?? "",
    sceneNegative: selectedScene?.negativePrompt ?? "",
    posePositive: selectedPose?.positivePrompt ?? "",
    poseNegative: selectedPose?.negativePrompt ?? "",
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
          <Label>Bối cảnh</Label>
          {activeScenes.length === 0 ? (
            <p className="text-sm text-amber-700">
              Chưa có bối cảnh nào. Vào <span className="font-medium">Thư viện prompt</span> để tạo.
            </p>
          ) : (
            <Select
              value={value.sceneId || undefined}
              onValueChange={(sceneId) => {
                if (typeof sceneId === "string") onChange({ ...value, sceneId });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn bối cảnh" />
              </SelectTrigger>
              <SelectContent>
                {activeScenes.map((scene) => (
                  <SelectItem key={scene.id} value={scene.id}>
                    {scene.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Tư thế</Label>
          {activePoses.length === 0 ? (
            <p className="text-sm text-amber-700">
              Chưa có tư thế nào. Vào <span className="font-medium">Thư viện prompt</span> để tạo.
            </p>
          ) : (
            <Select
              value={value.poseId || undefined}
              onValueChange={(poseId) => {
                if (typeof poseId === "string") onChange({ ...value, poseId });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn tư thế" />
              </SelectTrigger>
              <SelectContent>
                {activePoses.map((pose) => (
                  <SelectItem key={pose.id} value={pose.id}>
                    {pose.name}
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
                <p className="text-muted-foreground">{preview.parts.positive.global || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Style (nhân vật)</p>
                <p className="text-muted-foreground">{preview.parts.positive.style || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Bối cảnh</p>
                <p className="text-muted-foreground">{preview.parts.positive.scene || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Tư thế</p>
                <p className="text-muted-foreground">{preview.parts.positive.pose || "—"}</p>
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
