import { QuickCreateForm } from "@/components/create/quick-create-form";
import { ModeSwitcher } from "@/components/create/mode-switcher";

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ModeSwitcher />
      <QuickCreateForm />
    </div>
  );
}
