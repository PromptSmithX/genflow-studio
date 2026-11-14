import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeBatch {
  id: string;
  ideaPrompt: string;
  mediumId: string | null;
  status: string;
  draftError: string | null;
  draftParamsJson: string | null;
  requestedCount: number;
  createdAt: Date;
  jobs: { status: string; _count: { images: number } }[];
}

const db = vi.hoisted(() => ({ batches: [] as FakeBatch[] }));

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      create: vi.fn(async ({ data }: { data: Partial<FakeBatch> }) => {
        const batch: FakeBatch = {
          id: `b${db.batches.length + 1}`,
          ideaPrompt: data.ideaPrompt ?? "",
          mediumId: data.mediumId ?? null,
          status: data.status ?? "drafting",
          draftError: null,
          draftParamsJson: data.draftParamsJson ?? null,
          requestedCount: data.requestedCount ?? 13,
          createdAt: new Date(Date.now() + db.batches.length),
          jobs: [],
        };
        db.batches.push(batch);
        return batch;
      }),
      findFirst: vi.fn(async () => db.batches.find((b) => b.status === "drafting" && b.draftError === null) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.batches.find((b) => b.id === where.id) ?? null),
      findMany: vi.fn(async () => db.batches.filter((b) => ["drafting", "queued", "running"].includes(b.status))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeBatch> }) => {
        const batch = db.batches.find((b) => b.id === where.id)!;
        Object.assign(batch, data);
        return batch;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        db.batches = db.batches.filter((b) => b.id !== where.id);
      }),
    },
    mediumPreset: {
      findUnique: vi.fn(async () => ({ id: "m1", name: "Anime", positivePrompt: "anime style", negativePrompt: "photo" })),
      findMany: vi.fn(async () => [{ id: "m1", name: "Anime" }]),
    },
  },
}));

const ready = vi.hoisted(() => ({ llm: true, workflow: true }));
vi.mock("@/lib/settings", () => ({ getOrCreateSettings: vi.fn(async () => ({})) }));
vi.mock("@/lib/llm/resolve-config", () => ({ resolveLlmConfig: vi.fn(() => (ready.llm ? { model: "x" } : null)) }));
vi.mock("@/lib/comfyui/runpod-client", () => ({ getRunpodClient: vi.fn() }));
vi.mock("@/lib/comfyui/workflow-store", () => ({
  getWorkflowConfig: vi.fn(async () => (ready.workflow ? { isValidated: true } : null)),
}));

const suggestPrompts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/llm/suggest-prompts", () => ({ suggestPrompts }));

const createAndSubmitBatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/generations/create-batch", () => ({ createAndSubmitBatch }));

const ensureSkuBase = vi.hoisted(() => vi.fn(async () => "CAL-GEN-2611-ABCDE"));
vi.mock("@/lib/r2/sku", () => ({ ensureSkuBase }));

import {
  cancelDraft,
  draftQueueState,
  enqueueDraft,
  kickDraftQueue,
  listDraftQueue,
  retryDraft,
} from "@/lib/generations/draft-queue";

const suggestion = {
  images: [{ positive: "1girl, garden", caption: "c" }],
  negative: "blurry",
  etsy: { title: "T", description: "D", tags: ["a"] },
  concept: { campaignTheme: "Garden", anchorTags: "red hair" },
  conceptSeedKey: "garden",
  appearanceKey: "|red|slim",
  usage: null,
};

async function drained() {
  await vi.waitFor(() => expect(draftQueueState.running).toBeFalsy());
}

describe("draft queue", () => {
  beforeEach(() => {
    db.batches = [];
    ready.llm = true;
    ready.workflow = true;
    draftQueueState.running = false;
    draftQueueState.activeBatchId = null;
    suggestPrompts.mockReset().mockResolvedValue(suggestion);
    ensureSkuBase.mockReset().mockResolvedValue("CAL-GEN-2611-ABCDE");
    createAndSubmitBatch.mockReset().mockImplementation(async (_input, { existingBatchId }) => {
      db.batches.find((b) => b.id === existingBatchId)!.status = "queued";
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns immediately with a drafting batch, then drafts and submits it in the background", async () => {
    const batch = await enqueueDraft({ request: "cô gái", mediumId: "m1", steps: 8 });
    expect(batch.status).toBe("drafting");
    await drained();

    expect(suggestPrompts).toHaveBeenCalledWith({ request: "cô gái", count: 13, mediumId: "m1" });
    const [input, options] = createAndSubmitBatch.mock.calls[0];
    expect(options).toEqual({ existingBatchId: batch.id });
    expect(input.images[0].positiveOverride).toBe("anime style, 1girl, garden");
    expect(input.images[0].negativeOverride).toBe("photo, blurry");
    expect(input.steps).toBe(8);
    expect(input.seedMode).toBe("fixed");
    expect(input.concept).toMatchObject({ theme: "Garden", seedKey: "garden", appearanceKey: "|red|slim" });
    expect(db.batches[0].status).toBe("queued");
  });

  it("drafts one batch at a time, oldest first", async () => {
    const order: string[] = [];
    let inFlight = 0;
    suggestPrompts.mockImplementation(async ({ request }: { request: string }) => {
      inFlight++;
      expect(inFlight).toBe(1);
      order.push(request);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return suggestion;
    });
    await enqueueDraft({ request: "one" });
    await enqueueDraft({ request: "two" });
    await enqueueDraft({ request: "three" });
    kickDraftQueue();
    await drained();
    expect(order).toEqual(["one", "two", "three"]);
  });

  it("records the error and moves on to the next batch; retry drafts it again", async () => {
    suggestPrompts.mockRejectedValueOnce(new Error("LLM trả lỗi HTTP 429"));
    const first = await enqueueDraft({ request: "one" });
    await enqueueDraft({ request: "two" });
    await drained();

    expect(db.batches[0]).toMatchObject({ status: "drafting", draftError: "LLM trả lỗi HTTP 429" });
    expect(db.batches[1].status).toBe("queued");

    await retryDraft(first.id);
    await drained();
    expect(db.batches[0]).toMatchObject({ status: "queued", draftError: null });
  });

  it("refuses to enqueue when the assistant or workflow is not configured", async () => {
    ready.llm = false;
    await expect(enqueueDraft({ request: "x" })).rejects.toThrow("Trợ lý AI");
    ready.llm = true;
    ready.workflow = false;
    await expect(enqueueDraft({ request: "x" })).rejects.toThrow("workflow");
    expect(db.batches).toHaveLength(0);
  });

  it("cancels waiting batches but not the one being drafted", async () => {
    draftQueueState.running = true;
    const active = await enqueueDraft({ request: "active" });
    const waiting = await enqueueDraft({ request: "waiting" });
    draftQueueState.activeBatchId = active.id;

    await expect(cancelDraft(active.id)).rejects.toThrow("đang soạn");
    await cancelDraft(waiting.id);
    expect(db.batches.map((b) => b.id)).toEqual([active.id]);
  });

  it("lists queue states with waiting positions", async () => {
    draftQueueState.running = true;
    const active = await enqueueDraft({ request: "a", mediumId: "m1" });
    await enqueueDraft({ request: "b" });
    const failed = await enqueueDraft({ request: "c" });
    await enqueueDraft({ request: "d" });
    draftQueueState.activeBatchId = active.id;
    failed.draftError = "boom";

    const items = await listDraftQueue();
    expect(items.map((item) => [item.ideaPrompt, item.state, item.queuePosition])).toEqual([
      ["a", "drafting", null],
      ["b", "waiting", 1],
      ["c", "draft_failed", null],
      ["d", "waiting", 2],
    ]);
    expect(items[0].mediumName).toBe("Anime");
  });
});
