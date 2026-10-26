import { GlobalPromptCard } from "@/components/prompts/global-prompt-card";
import { StyleList } from "@/components/prompts/style-list";

export default function PromptsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <GlobalPromptCard />
      <div>
        <h2 className="mb-3 text-base font-semibold">Style library</h2>
        <StyleList />
      </div>
    </div>
  );
}
