import { ConnectionCard } from "@/components/settings/connection-card";
import { WorkflowCard } from "@/components/settings/workflow-card";
import { NodeMappingCard } from "@/components/settings/node-mapping-card";
import { DefaultsCard } from "@/components/settings/defaults-card";
import { LlmCard } from "@/components/settings/llm-card";
import { MediumCard } from "@/components/settings/medium-card";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ConnectionCard />
      <WorkflowCard />
      <NodeMappingCard />
      <DefaultsCard />
      <LlmCard />
      <MediumCard />
    </div>
  );
}
