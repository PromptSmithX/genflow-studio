"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MediumLibrary } from "@/components/prompts/medium-library";

export function MediumCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kiểu ảnh (Trợ lý AI)</CardTitle>
        <CardDescription>
          Bộ tag phong cách/chất lượng (vd: Người thực, Anime) để ghép vào prompt khi dùng Trợ lý AI, không phụ
          thuộc vào chất lượng mô tả của LLM. Chọn một kiểu ở Trợ lý AI sẽ tự chèn tag positive/negative dưới đây
          vào mỗi ảnh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MediumLibrary />
      </CardContent>
    </Card>
  );
}
