import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

export interface PresetDTO {
  id: string;
  name: string;
  description: string | null;
  positivePrompt: string;
  negativePrompt: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PresetInput {
  name: string;
  description?: string | null;
  positivePrompt?: string;
  negativePrompt?: string;
  isActive?: boolean;
}

export interface PresetHooks {
  useList: () => UseQueryResult<PresetDTO[], Error>;
  useCreate: () => UseMutationResult<PresetDTO, Error, PresetInput, unknown>;
  useUpdate: () => UseMutationResult<PresetDTO, Error, { id: string; input: Partial<PresetInput> }, unknown>;
  useDelete: () => UseMutationResult<{ ok: true }, Error, string, unknown>;
}

export interface PresetLabels {
  /** Danh từ của loại preset, vd: "style", "bối cảnh", "tư thế". */
  noun: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
}
