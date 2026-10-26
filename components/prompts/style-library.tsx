"use client";

import { PresetLibrary } from "@/components/prompts/preset-library";
import { useStyles, useCreateStyle, useUpdateStyle, useDeleteStyle } from "@/hooks/use-styles";

const hooks = { useList: useStyles, useCreate: useCreateStyle, useUpdate: useUpdateStyle, useDelete: useDeleteStyle };

export function StyleLibrary() {
  return (
    <PresetLibrary
      hooks={hooks}
      labels={{ noun: "style", namePlaceholder: "Anime Cinematic", descriptionPlaceholder: "Nhân vật nữ tóc xanh, mắt to" }}
    />
  );
}
