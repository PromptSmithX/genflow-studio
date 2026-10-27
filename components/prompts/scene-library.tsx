"use client";

import { PresetLibrary } from "@/components/prompts/preset-library";
import { useScenes, useCreateScene, useUpdateScene, useDeleteScene } from "@/hooks/use-scenes";

const hooks = { useList: useScenes, useCreate: useCreateScene, useUpdate: useUpdateScene, useDelete: useDeleteScene };

export function SceneLibrary() {
  return (
    <PresetLibrary
      hooks={hooks}
      labels={{ noun: "bối cảnh", namePlaceholder: "Khu vườn ngập nắng", descriptionPlaceholder: "Ngoài trời, ánh nắng vàng" }}
    />
  );
}
