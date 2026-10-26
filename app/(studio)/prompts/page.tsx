import { GlobalPromptCard } from "@/components/prompts/global-prompt-card";
import { StyleLibrary } from "@/components/prompts/style-library";
import { SceneLibrary } from "@/components/prompts/scene-library";
import { PoseLibrary } from "@/components/prompts/pose-library";

export default function PromptsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <GlobalPromptCard />
      <div>
        <h2 className="mb-1 text-base font-semibold">Thư viện style (nhân vật)</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Prompt cố định về nhân vật (khuôn mặt, kiểu tóc, vóc dáng...) — chọn 1 style áp cho cả loạt ảnh.
        </p>
        <StyleLibrary />
      </div>
      <div>
        <h2 className="mb-1 text-base font-semibold">Thư viện bối cảnh</h2>
        <p className="mb-3 text-sm text-muted-foreground">Bối cảnh / background — mỗi ảnh chọn một bối cảnh riêng.</p>
        <SceneLibrary />
      </div>
      <div>
        <h2 className="mb-1 text-base font-semibold">Thư viện tư thế</h2>
        <p className="mb-3 text-sm text-muted-foreground">Tư thế / phong cách dáng — mỗi ảnh chọn một tư thế riêng.</p>
        <PoseLibrary />
      </div>
    </div>
  );
}
