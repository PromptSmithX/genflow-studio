import { AssistantCreateForm } from "@/components/create/assistant-create-form";
import { ModeSwitcher } from "@/components/create/mode-switcher";

export default function CreateAssistantPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ModeSwitcher />
      <AssistantCreateForm />
    </div>
  );
}
