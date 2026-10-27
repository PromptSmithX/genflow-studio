"use client";

import { PresetLibrary } from "@/components/prompts/preset-library";
import { usePoses, useCreatePose, useUpdatePose, useDeletePose } from "@/hooks/use-poses";

const hooks = { useList: usePoses, useCreate: useCreatePose, useUpdate: useUpdatePose, useDelete: useDeletePose };

export function PoseLibrary() {
  return (
    <PresetLibrary
      hooks={hooks}
      labels={{ noun: "tư thế", namePlaceholder: "Đứng nhìn về phía camera", descriptionPlaceholder: "Dáng đứng, tay chống hông" }}
    />
  );
}
