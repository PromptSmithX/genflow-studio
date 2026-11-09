"use client";

import { useAdvancedMode } from "@/hooks/use-settings";
import { ConnectionCard } from "@/components/settings/connection-card";
import { SystemStatusCard } from "@/components/settings/system-status-card";
import { AdvancedModeCard } from "@/components/settings/advanced-mode-card";
import { WorkflowCard } from "@/components/settings/workflow-card";
import { NodeMappingCard } from "@/components/settings/node-mapping-card";
import { DefaultsCard } from "@/components/settings/defaults-card";
import { AutoPublishCard } from "@/components/settings/auto-publish-card";
import { LlmCard } from "@/components/settings/llm-card";
import { MediumCard } from "@/components/settings/medium-card";

export default function SettingsPage() {
  const advancedMode = useAdvancedMode();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ConnectionCard />

      {!advancedMode ? (
        <>
          <SystemStatusCard />
          <AdvancedModeCard />
        </>
      ) : (
        <>
          <WorkflowCard />
          <NodeMappingCard />
          <DefaultsCard />
          <AutoPublishCard />
          <LlmCard />
          <MediumCard />
          <AdvancedModeCard />
        </>
      )}
    </div>
  );
}
