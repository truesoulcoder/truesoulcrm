// src/components/campaign_dashboard/campaign-settings.tsx
import React from "react";
import { Tabs, Tab, Input, Checkbox, Button } from "@heroui/react";
import type { Tables } from "@/types/supabase";

interface CampaignSettingsProps {
  currentCampaign: Tables<'campaigns'> | null;
}

export const CampaignSettings: React.FC<CampaignSettingsProps> = ({ currentCampaign }) => {
  return (
    <div className="w-full h-full flex flex-col">
      <Tabs
        aria-label="Campaign settings tabs"
        classNames={{ base: "w-full", panel: "p-4", tabContent: "text-xs" }}
      >
        <Tab key="general" title="General">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              size="lg"
              labelPlacement="outside"
              label={<span className="text-xs">Campaign Name</span>}
              placeholder="Enter campaign name"
              defaultValue={currentCampaign?.name || ""}
            />
            <Input
              size="lg"
              labelPlacement="outside"
              label={<span className="text-xs">Sender Name</span>}
              placeholder="Enter sender name"
              defaultValue="Marketing Team"
            />
            <Input
              size="lg"
              labelPlacement="outside"
              label={<span className="text-xs">Reply-to Email</span>}
              placeholder="Enter reply-to email"
              defaultValue="marketing@example.com"
            />
            <Input
              size="lg"
              type="url"
              labelPlacement="outside"
              label={<span className="text-xs">Unsubscribe URL</span>}
              placeholder="Enter unsubscribe URL"
              defaultValue="https://example.com/unsubscribe"
            />
          </div>
        </Tab>
        <Tab key="scheduling" title="Scheduling">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input size="lg" labelPlacement="outside" label={<span className="text-xs">Start Date</span>} type="date" />
            <Input size="lg" labelPlacement="outside" label={<span className="text-xs">Start Time</span>} type="time" />
            <div className="md:col-span-2 flex flex-col gap-2 mt-2">
              <Checkbox size="sm"><span className="text-xs">Send follow-up to non-openers</span></Checkbox>
              <Checkbox size="sm"><span className="text-xs">Throttle sending</span></Checkbox>
            </div>
          </div>
        </Tab>
        <Tab key="tracking" title="Tracking">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
               <Checkbox size="sm"><span className="text-xs">Track email opens</span></Checkbox>
               <Checkbox size="sm"><span className="text-xs">Track link clicks</span></Checkbox>
            </div>
            <Input
              size="lg"
              labelPlacement="outside"
              label={<span className="text-xs">Google Analytics ID</span>}
              placeholder="Enter GA ID"
              defaultValue="UA-XXXXX-Y"
            />
          </div>
        </Tab>
      </Tabs>
      <div className="p-4 mt-auto">
        <Button color="primary" fullWidth>Save Settings</Button>
      </div>
    </div>
  );
};