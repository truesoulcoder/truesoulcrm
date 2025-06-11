"use client";

import React from "react";
import { Tabs, Tab, Input, Checkbox } from "@heroui/react";

interface CampaignSettingsProps {
  currentCampaign: string;
}

export const CampaignSettings: React.FC<CampaignSettingsProps> = ({ currentCampaign }) => {
  return (
    <Tabs 
      aria-label="Campaign settings tabs"
      classNames={{
        panel: "py-2", // Reduce padding to minimize whitespace
        base: "h-auto", // Ensure height fits content
      }}
    >
      <Tab key="general" title="General">
        <div className="grid grid-cols-1 gap-4 p-2 md:grid-cols-2">
          <div>
            <Input
              label="Campaign Name"
              placeholder="Enter campaign name"
              defaultValue={currentCampaign}
            />
          </div>
          <div>
            <Input
              label="Sender Name"
              placeholder="Enter sender name"
              defaultValue="Marketing Team"
            />
          </div>
          <div>
            <Input
              label="Reply-to Email"
              placeholder="Enter reply-to email"
              defaultValue="marketing@example.com"
            />
          </div>
          <div>
            <Input
              type="url"
              label="Unsubscribe URL"
              placeholder="Enter unsubscribe URL"
              defaultValue="https://example.com/unsubscribe"
            />
          </div>
        </div>
      </Tab>
      <Tab key="scheduling" title="Scheduling">
        <div className="grid grid-cols-1 gap-4 p-2 md:grid-cols-2">
          <div>
            <Input
              label="Start Date"
              placeholder="Select start date"
              type="date"
            />
          </div>
          <div>
            <Input
              label="Start Time"
              placeholder="Select start time"
              type="time"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Checkbox defaultSelected>
              Send follow-up to non-openers
            </Checkbox>
            <Checkbox>
              Throttle sending (avoid spam filters)
            </Checkbox>
          </div>
          <div>
            <Input
              label="Sending Rate"
              placeholder="Emails per hour"
              defaultValue="500"
              type="number"
            />
          </div>
        </div>
      </Tab>
      <Tab key="tracking" title="Tracking">
        <div className="flex flex-col gap-4 p-2">
          <div className="flex flex-col gap-2">
            <Checkbox defaultSelected>Track email opens</Checkbox>
            <Checkbox defaultSelected>Track link clicks</Checkbox>
            <Checkbox>Track replies</Checkbox>
            <Checkbox>Add UTM parameters to links</Checkbox>
          </div>
          <div>
            <Input
              label="Google Analytics ID"
              placeholder="Enter GA ID"
              defaultValue="UA-XXXXX-Y"
            />
          </div>
        </div>
      </Tab>
    </Tabs>
  );
};