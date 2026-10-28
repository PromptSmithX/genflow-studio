import { describe, expect, it } from "vitest";
import {
  applyWorkflowMapping,
  readMappedNumber,
  readMappedString,
  summarizeWorkflowNodes,
  validateMapping,
  WorkflowMappingError,
  type WorkflowApiJson,
} from "@/lib/comfyui/workflow-mapper";

const workflow: WorkflowApiJson = {
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "original positive", clip: ["4", 1] },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "original negative", clip: ["4", 1] },
  },
  "3": {
    class_type: "KSampler",
    inputs: { seed: 0, steps: 20, cfg: 8, sampler_name: "dpmpp_2m", latent_image: ["5", 0] },
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: 896, height: 1152, batch_size: 1 },
  },
};

describe("applyWorkflowMapping", () => {
  it("updates only the mapped fields and leaves everything else unchanged", () => {
    const result = applyWorkflowMapping(
      workflow,
      {
        positivePrompt: { nodeId: "6", inputKey: "text", enabled: true },
        seed: { nodeId: "3", inputKey: "seed", enabled: true },
      },
      { positivePrompt: "new positive", seed: 12345 },
    );

    expect(result["6"].inputs.text).toBe("new positive");
    expect(result["3"].inputs.seed).toBe(12345);
    // Unrelated fields are untouched.
    expect(result["7"].inputs.text).toBe("original negative");
    expect(result["3"].inputs.steps).toBe(20);
  });

  it("does not mutate the original workflow object", () => {
    applyWorkflowMapping(
      workflow,
      { positivePrompt: { nodeId: "6", inputKey: "text", enabled: true } },
      { positivePrompt: "mutated?" },
    );
    expect(workflow["6"].inputs.text).toBe("original positive");
  });

  it("skips disabled mappings", () => {
    const result = applyWorkflowMapping(
      workflow,
      { positivePrompt: { nodeId: "6", inputKey: "text", enabled: false } },
      { positivePrompt: "should not apply" },
    );
    expect(result["6"].inputs.text).toBe("original positive");
  });

  it("throws WorkflowMappingError for a missing node id", () => {
    expect(() =>
      applyWorkflowMapping(
        workflow,
        { positivePrompt: { nodeId: "99", inputKey: "text", enabled: true } },
        { positivePrompt: "x" },
      ),
    ).toThrow(WorkflowMappingError);
  });

  it("throws WorkflowMappingError for a missing input key", () => {
    expect(() =>
      applyWorkflowMapping(
        workflow,
        { positivePrompt: { nodeId: "6", inputKey: "not_a_real_key", enabled: true } },
        { positivePrompt: "x" },
      ),
    ).toThrow(WorkflowMappingError);
  });
});

describe("summarizeWorkflowNodes", () => {
  it("lists every node id, class type and input keys", () => {
    const summary = summarizeWorkflowNodes(workflow);
    expect(summary).toHaveLength(4);
    const node6 = summary.find((n) => n.nodeId === "6");
    expect(node6?.classType).toBe("CLIPTextEncode");
    expect(node6?.inputs.map((i) => i.key)).toContain("text");
  });
});

describe("readMappedNumber / readMappedString", () => {
  const mapping = {
    steps: { nodeId: "3", inputKey: "steps", enabled: true },
    cfg: { nodeId: "3", inputKey: "cfg", enabled: true },
    sampler: { nodeId: "3", inputKey: "sampler_name", enabled: true },
    width: { nodeId: "5", inputKey: "width", enabled: true },
    // Points at a node-reference input, not a literal.
    seed: { nodeId: "3", inputKey: "latent_image", enabled: true },
    // Mapped but disabled.
    height: { nodeId: "5", inputKey: "height", enabled: false },
  };

  it("reads the literal value baked into the workflow for a mapped number field", () => {
    expect(readMappedNumber(workflow, mapping, "steps")).toBe(20);
    expect(readMappedNumber(workflow, mapping, "cfg")).toBe(8);
    expect(readMappedNumber(workflow, mapping, "width")).toBe(896);
  });

  it("reads the literal value for a mapped string field", () => {
    expect(readMappedString(workflow, mapping, "sampler")).toBe("dpmpp_2m");
  });

  it("returns undefined for an unmapped field", () => {
    expect(readMappedNumber(workflow, {}, "steps")).toBeUndefined();
  });

  it("returns undefined for a disabled mapping", () => {
    expect(readMappedNumber(workflow, mapping, "height")).toBeUndefined();
  });

  it("returns undefined when the mapped input is a node reference, not a literal", () => {
    expect(readMappedNumber(workflow, mapping, "seed")).toBeUndefined();
  });

  it("returns undefined when the node or input no longer exists", () => {
    const stale = { steps: { nodeId: "99", inputKey: "steps", enabled: true } };
    expect(readMappedNumber(workflow, stale, "steps")).toBeUndefined();
  });
});

describe("validateMapping", () => {
  it("reports an issue when positivePrompt is not mapped", () => {
    const issues = validateMapping(workflow, {});
    expect(issues.some((i) => i.field === "positivePrompt")).toBe(true);
  });

  it("reports no issues for a fully valid mapping", () => {
    const issues = validateMapping(workflow, {
      positivePrompt: { nodeId: "6", inputKey: "text", enabled: true },
    });
    expect(issues).toHaveLength(0);
  });

  it("reports an issue for a mapping pointing at a nonexistent node", () => {
    const issues = validateMapping(workflow, {
      positivePrompt: { nodeId: "999", inputKey: "text", enabled: true },
    });
    expect(issues.some((i) => i.nodeId === "999")).toBe(true);
  });
});
