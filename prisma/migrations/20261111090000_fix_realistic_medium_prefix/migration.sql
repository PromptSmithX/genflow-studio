-- Prefix cũ của medium "Người thực" chứa token macro cận mặt (visible pores,
-- subsurface scattering, detailed eyes...) + "window light" (trong nhà). Đứng ở
-- đầu positive nên chọi với "full body / 35mm" -> Turbo vẽ ảnh tách đôi (mặt
-- cận + toàn thân). Seed chỉ chạy khi bảng rỗng nên DB cũ không tự cập nhật.
-- Chỉ ghi đè khi prefix còn NGUYÊN VĂN bản cũ (người dùng chưa tự sửa).
UPDATE "MediumPreset"
SET "positivePrompt" = 'photorealistic, real photography, raw photo, natural skin texture, natural skin imperfections, natural skin tones, soft natural lighting, sharp focus, high detail, depth of field, film grain, 8k uhd'
WHERE "name" = 'Người thực'
  AND "positivePrompt" = 'photorealistic, real photography, raw photo, realistic skin texture with visible pores, subsurface scattering, natural skin imperfections, fine skin texture, subtle facial asymmetry, natural skin tones, soft natural window light, detailed eyes, sharp focus, high detail, depth of field, film grain, 8k uhd';
