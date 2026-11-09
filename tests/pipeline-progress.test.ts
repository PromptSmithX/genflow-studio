import { describe, expect, it } from "vitest";
import { derivePipelineStepStates } from "@/components/history/pipeline-progress";

describe("derivePipelineStepStates", () => {
  it("does not blame step 1 when failed + autoStage is null but all images are ready", () => {
    const result = derivePipelineStepStates({
      autoStatus: "failed",
      autoStage: null,
      readyCount: 13,
      total: 13,
      pendingCount: 0,
      problemCount: 0,
    });

    expect(result.step1State).toBe("done");
    expect(result.step2State).toBe("waiting");
    expect(result.step3State).toBe("waiting");
    expect(result.step4State).toBe("waiting");
    expect(result.overallPercent).toBe(70);
  });

  it("marks step 1 as error when failed + autoStage is null and readyCount < total", () => {
    const result = derivePipelineStepStates({
      autoStatus: "failed",
      autoStage: null,
      readyCount: 10,
      total: 13,
      pendingCount: 0,
      problemCount: 0,
    });

    expect(result.step1State).toBe("error");
    expect(result.step2State).toBe("waiting");
    expect(result.step3State).toBe("waiting");
    expect(result.step4State).toBe("waiting");
    expect(result.overallPercent).toBe(54); // Math.round(10/13 * 70)
  });

  it("marks step 1 as error when failed + autoStage is null and problemCount > 0", () => {
    const result = derivePipelineStepStates({
      autoStatus: "failed",
      autoStage: null,
      readyCount: 12,
      total: 13,
      pendingCount: 0,
      problemCount: 1,
    });

    expect(result.step1State).toBe("error");
    expect(result.step2State).toBe("waiting");
    expect(result.step3State).toBe("waiting");
    expect(result.step4State).toBe("waiting");
  });

  it("marks step 2 as error when failed + autoStage === 'export'", () => {
    const result = derivePipelineStepStates({
      autoStatus: "failed",
      autoStage: "export",
      readyCount: 13,
      total: 13,
    });

    expect(result.step1State).toBe("done");
    expect(result.step2State).toBe("error");
    expect(result.step3State).toBe("waiting");
    expect(result.step4State).toBe("waiting");
    expect(result.overallPercent).toBe(70);
  });

  it("marks step 3 as error when failed + autoStage === 'r2'", () => {
    const result = derivePipelineStepStates({
      autoStatus: "failed",
      autoStage: "r2",
      readyCount: 13,
      total: 13,
    });

    expect(result.step1State).toBe("done");
    expect(result.step2State).toBe("done");
    expect(result.step3State).toBe("error");
    expect(result.step4State).toBe("waiting");
    expect(result.overallPercent).toBe(80);
  });

  it("marks step 4 as error when failed + autoStage === 'sheet'", () => {
    const result = derivePipelineStepStates({
      autoStatus: "failed",
      autoStage: "sheet",
      readyCount: 13,
      total: 13,
    });

    expect(result.step1State).toBe("done");
    expect(result.step2State).toBe("done");
    expect(result.step3State).toBe("done");
    expect(result.step4State).toBe("error");
    expect(result.overallPercent).toBe(90);
  });

  it("marks all steps done when autoStatus === 'done'", () => {
    const result = derivePipelineStepStates({
      autoStatus: "done",
      autoStage: null,
      readyCount: 13,
      total: 13,
    });

    expect(result.step1State).toBe("done");
    expect(result.step2State).toBe("done");
    expect(result.step3State).toBe("done");
    expect(result.step4State).toBe("done");
    expect(result.overallPercent).toBe(100);
  });
});
