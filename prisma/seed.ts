import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
        maxImagesPerBatch: 8,
        outputDirectory: "data/outputs",
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
