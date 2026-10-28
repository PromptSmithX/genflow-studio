import { describe, expect, it } from "vitest";
import { guessNodeMapping, type WorkflowApiJson } from "@/lib/comfyui/workflow-mapper";

const typicalWorkflow: WorkflowApiJson = {
  "6": { class_type: "CLIPTextEncode", inputs: { text: "positive text", clip: ["4", 1] } },
  "7": { class_type: "CLIPTextEncode", inputs: { text: "negative text", clip: ["4", 1] } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 123,
      steps: 25,
      cfg: 7,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["5", 0],
    },
  },
};

describe("guessNodeMapping", () => {
  it("maps sampler fields and resolves positive/negative via references", () => {
    const mapping = guessNodeMapping(typicalWorkflow);

    expect(mapping.positivePrompt).toEqual({ nodeId: "6", inputKey: "text", enabled: true });
    expect(mapping.negativePrompt).toEqual({ nodeId: "7", inputKey: "text", enabled: true });
    expect(mapping.seed).toEqual({ nodeId: "3", inputKey: "seed", enabled: true });
    expect(mapping.steps).toEqual({ nodeId: "3", inputKey: "steps", enabled: true });
    expect(mapping.cfg).toEqual({ nodeId: "3", inputKey: "cfg", enabled: true });
    expect(mapping.sampler).toEqual({ nodeId: "3", inputKey: "sampler_name", enabled: true });
    expect(mapping.scheduler).toEqual({ nodeId: "3", inputKey: "scheduler", enabled: true });
    expect(mapping.width).toEqual({ nodeId: "5", inputKey: "width", enabled: true });
    expect(mapping.height).toEqual({ nodeId: "5", inputKey: "height", enabled: true });
    expect(mapping.batchSize).toEqual({ nodeId: "5", inputKey: "batch_size", enabled: true });
  });

  it("falls back to noise_seed when the sampler has no plain seed input", () => {
    const workflow: WorkflowApiJson = {
      "10": { class_type: "CLIPTextEncode", inputs: { text: "pos" } },
      "11": { class_type: "CLIPTextEncode", inputs: { text: "neg" } },
      "9": {
        class_type: "KSamplerAdvanced",
        inputs: { noise_seed: 42, steps: 30, positive: ["10", 0], negative: ["11", 0] },
      },
    };
    const mapping = guessNodeMapping(workflow);
    expect(mapping.seed).toEqual({ nodeId: "9", inputKey: "noise_seed", enabled: true });
    expect(mapping.positivePrompt?.nodeId).toBe("10");
  });

  it("leaves width/height unmapped when there is no latent node", () => {
    const workflow: WorkflowApiJson = {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "pos" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "neg" } },
      "3": { class_type: "KSampler", inputs: { seed: 1, positive: ["1", 0], negative: ["2", 0] } },
    };
    const mapping = guessNodeMapping(workflow);
    expect(mapping.width).toBeUndefined();
    expect(mapping.height).toBeUndefined();
    expect(mapping.positivePrompt).toBeDefined();
  });

  it("returns an empty mapping for a workflow with no recognizable nodes", () => {
    const workflow: WorkflowApiJson = {
      "1": { class_type: "SaveImage", inputs: { images: ["2", 0] } },
    };
    expect(guessNodeMapping(workflow)).toEqual({});
  });
});
