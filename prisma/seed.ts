import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { guessNodeMapping, validateMapping, type WorkflowApiJson } from "../lib/comfyui/workflow-mapper";
import { getDataRoot } from "../lib/paths";

const prisma = new PrismaClient();

// File nguồn git-tracked (data/workflows/ bị gitignore nên không dùng được làm
// nguồn seed) -- xem Feature 2 trong plan: ship workflow mặc định để user mới
// không phải tự import. build-template-db.mjs copy file này sang
// resources/template/workflows/ để Electron bake vào installer.
const DEFAULT_WORKFLOW_SOURCE = path.join(__dirname, "seed-assets", "default-workflow.json");
const DEFAULT_WORKFLOW_FILENAME = "default-workflow.json";

/**
 * Seeds only create rows when the relevant table is completely empty, so a
 * normal app restart never overwrites a user's own edits to settings,
 * global prompt or styles.
 */
async function main() {
  const globalPromptCount = await prisma.globalPrompt.count();
  if (globalPromptCount === 0) {
    await prisma.globalPrompt.create({
      data: {
        id: "main",
        positivePrompt: "",
        negativePrompt:
          "blurry, low quality, malformed anatomy, extra fingers, watermark, unwanted text",
      },
    });
    console.log("Seeded GlobalPrompt (mẫu, có thể sửa/xóa).");
  }

  const settingsCount = await prisma.appSettings.count();
  if (settingsCount === 0) {
    await prisma.appSettings.create({
      data: {
        id: "main",
        defaultWidth: 1024,
        defaultHeight: 1024,
        defaultSteps: 25,
        defaultCfg: 4.0,
        defaultSeedMode: "random",
        maxImagesPerBatch: 15,
        outputDirectory: "outputs",
      },
    });
    console.log("Seeded AppSettings.");
  }

  const styleCount = await prisma.stylePreset.count();
  if (styleCount === 0) {
    await prisma.stylePreset.createMany({
      data: [
        {
          name: "Anime Cinematic",
          description: "Phong cách anime điện ảnh, ánh sáng kịch tính, màu sắc sâu.",
          positivePrompt:
            "anime style, cinematic lighting, dramatic shadows, detailed background, vibrant colors",
          negativePrompt: "",
          isActive: true,
          sortOrder: 0,
        },
        {
          name: "Soft Illustration",
          description: "Minh họa mềm mại, màu pastel, nét vẽ nhẹ nhàng.",
          positivePrompt: "soft illustration, pastel colors, gentle linework, delicate shading",
          negativePrompt: "",
          isActive: true,
          sortOrder: 1,
        },
        {
          name: "Manga Art",
          description: "Nét vẽ manga đen trắng/đậm nét, phong cách truyện tranh Nhật.",
          positivePrompt: "manga art style, bold inked lines, screentone shading, high contrast",
          negativePrompt: "",
          isActive: true,
          sortOrder: 2,
        },
      ],
    });
    console.log("Seeded 3 style mẫu (có thể sửa/xóa).");
  }

  const mediumCount = await prisma.mediumPreset.count();
  if (mediumCount === 0) {
    await prisma.mediumPreset.createMany({
      data: [
        {
          name: "Người thực",
          description: "Ảnh chụp người thật, da/ánh sáng tự nhiên.",
          positivePrompt:
            "photorealistic, real photography, raw photo, realistic skin texture with visible pores, subsurface scattering, natural skin imperfections, fine skin texture, subtle facial asymmetry, natural skin tones, soft natural window light, detailed eyes, sharp focus, high detail, depth of field, film grain, 8k uhd",
          negativePrompt:
            "anime, cartoon, cel shading, illustration, painting, drawing, 3d render, cgi, doll, plastic skin, waxy skin",
          isActive: true,
          sortOrder: 0,
        },
        {
          name: "Anime",
          description: "Phong cách anime, nét vẽ sạch, màu sắc rực rỡ.",
          positivePrompt:
            "anime style, high quality anime key visual, clean lineart, cel shading, vibrant saturated colors, detailed anime eyes, soft anime shading, sharp focus, highly detailed",
          negativePrompt:
            "photorealistic, realistic photo, real life, 3d render, cgi, photograph, realistic skin texture",
          isActive: true,
          sortOrder: 1,
        },
      ],
    });
    console.log("Seeded 2 kiểu ảnh mẫu (có thể sửa/xóa).");
  }

  const workflowCount = await prisma.workflowConfig.count();
  if (workflowCount === 0) {
    const raw = await fs.readFile(DEFAULT_WORKFLOW_SOURCE, "utf-8");
    const parsed = JSON.parse(raw) as WorkflowApiJson;

    // Ghi file workflow vào đúng WORKFLOW_ROOT (data/workflows ở dev; ở build
    // template nó cũng là data/workflows của repo vì ANIMA_DATA_DIR chưa set
    // lúc build) để loadWorkflowJson() tìm thấy ngay, không chỉ có row DB.
    const workflowRoot = path.join(getDataRoot(), "workflows");
    await fs.mkdir(workflowRoot, { recursive: true });
    await fs.writeFile(path.join(workflowRoot, DEFAULT_WORKFLOW_FILENAME), JSON.stringify(parsed, null, 2), "utf-8");

    const nodeCount = Object.keys(parsed).length;
    const mapping = guessNodeMapping(parsed);
    const isValid = validateMapping(parsed, mapping).length === 0;

    await prisma.workflowConfig.create({
      data: {
        id: "main",
        workflowRelativePath: DEFAULT_WORKFLOW_FILENAME,
        originalFilename: "LUSTIFY_v10_Krea2_Turbo_INT8 (mặc định)",
        nodeCount,
        nodeMappingJson: JSON.stringify(mapping),
        isValidated: isValid,
        validatedAt: isValid ? new Date() : null,
      },
    });
    console.log("Seeded WorkflowConfig mặc định (LUSTIFY Krea2 Turbo INT8).");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
