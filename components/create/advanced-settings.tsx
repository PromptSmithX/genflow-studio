"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NodeMapping } from "@/lib/comfyui/workflow-mapper";

export interface AdvancedSettingsState {
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seedMode: "random" | "fixed";
  fixedSeed: string;
  incrementFixedSeed: boolean;
  sampler: string;
  scheduler: string;
}

interface AdvancedSettingsProps {
  value: AdvancedSettingsState;
  onChange: (next: AdvancedSettingsState) => void;
  mapping: NodeMapping | undefined;
}

export function AdvancedSettings({ value, onChange, mapping }: AdvancedSettingsProps) {
  const showSampler = Boolean(mapping?.sampler?.enabled);
  const showScheduler = Boolean(mapping?.scheduler?.enabled);

  return (
    <Accordion>
      <AccordionItem value="advanced-settings">
        <AccordionTrigger>Thông số nâng cao</AccordionTrigger>
        <AccordionContent className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label>Width</Label>
              <Input type="number" value={value.width} onChange={(e) => onChange({ ...value, width: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Height</Label>
              <Input type="number" value={value.height} onChange={(e) => onChange({ ...value, height: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Steps</Label>
              <Input type="number" value={value.steps} onChange={(e) => onChange({ ...value, steps: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>CFG</Label>
              <Input type="number" step="0.1" value={value.cfg} onChange={(e) => onChange({ ...value, cfg: Number(e.target.value) })} />
            </div>
          </div>

          {(showSampler || showScheduler) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {showSampler && (
                <div className="space-y-2">
                  <Label>Sampler</Label>
                  <Input value={value.sampler} onChange={(e) => onChange({ ...value, sampler: e.target.value })} />
                </div>
              )}
              {showScheduler && (
                <div className="space-y-2">
                  <Label>Scheduler</Label>
                  <Input value={value.scheduler} onChange={(e) => onChange({ ...value, scheduler: e.target.value })} />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Seed</Label>
            <Select
              value={value.seedMode}
              onValueChange={(v) => {
                if (typeof v === "string") onChange({ ...value, seedMode: v as "random" | "fixed" });
              }}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Ngẫu nhiên cho từng ảnh</SelectItem>
                <SelectItem value="fixed">Dùng seed cố định</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.seedMode === "fixed" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Seed cố định</Label>
                <Input
                  type="number"
                  value={value.fixedSeed}
                  onChange={(e) => onChange({ ...value, fixedSeed: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cách dùng cho nhiều ảnh</Label>
                <Select
                  value={value.incrementFixedSeed ? "increment" : "same"}
                  onValueChange={(v) => {
                    if (typeof v === "string") onChange({ ...value, incrementFixedSeed: v === "increment" });
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same">Dùng cùng một seed cho tất cả ảnh</SelectItem>
                    <SelectItem value="increment">Tăng dần seed theo từng ảnh (+1, +2, ...)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
