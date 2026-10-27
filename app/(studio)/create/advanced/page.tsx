import { CreateForm } from "@/components/create/create-form";
import { ModeSwitcher } from "@/components/create/mode-switcher";

export default function CreateAdvancedPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ModeSwitcher />
      <CreateForm />
    </div>
  );
}
