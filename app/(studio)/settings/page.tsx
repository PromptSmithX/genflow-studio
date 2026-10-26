import { ConnectionCard } from "@/components/settings/connection-card";
import { WorkflowCard } from "@/components/settings/workflow-card";
import { NodeMappingCard } from "@/components/settings/node-mapping-card";
import { DefaultsCard } from "@/components/settings/defaults-card";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ConnectionCard />
      <WorkflowCard />
      <NodeMappingCard />
      <DefaultsCard />
    </div>
  );
}
