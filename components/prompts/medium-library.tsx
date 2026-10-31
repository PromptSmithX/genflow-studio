"use client";

import { PresetLibrary } from "@/components/prompts/preset-library";
import { useMediums, useCreateMedium, useUpdateMedium, useDeleteMedium } from "@/hooks/use-mediums";

const hooks = { useList: useMediums, useCreate: useCreateMedium, useUpdate: useUpdateMedium, useDelete: useDeleteMedium };

export function MediumLibrary() {
  return (
    <PresetLibrary
      hooks={hooks}
      labels={{ noun: "kiểu ảnh", namePlaceholder: "Người thực", descriptionPlaceholder: "Ảnh chụp người thật, da/ánh sáng tự nhiên" }}
    />
  );
}
