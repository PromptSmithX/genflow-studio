/**
 * Script chạy 1 lần: cập nhật prefix của medium "Người thực" trong DB đang chạy,
 * bỏ các token ép cự ly cận mặt (visible pores / subsurface scattering /
 * detailed eyes / subtle facial asymmetry) gây lỗi ảnh bị chia đôi (mặt cận +
 * thân). Seed chỉ chạy khi bảng rỗng nên không tự ghi đè được row cũ -> cần
 * script này. Chạy: npx tsx scripts/fix-realistic-medium.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_POSITIVE =
  "photorealistic, real photography, raw photo, natural skin texture, natural skin imperfections, natural skin tones, soft natural lighting, sharp focus, high detail, depth of field, film grain, 8k uhd";

async function main() {
  const result = await prisma.mediumPreset.updateMany({
    where: { name: "Người thực" },
    data: { positivePrompt: NEW_POSITIVE },
  });
  console.log(`Đã cập nhật ${result.count} medium "Người thực".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
