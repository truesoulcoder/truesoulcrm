import React from "react";
import { Tabs, Tab, Input, Checkbox } from "@heroui/react";

interface CampaignSettingsProps {
  currentCampaign: string;
}

export const CampaignSettings: React.FC<CampaignSettingsProps> = ({ currentCampaign }) => {
  return (
    <div className="w-full">
        <Tabs aria-label="Campaign settings tabs" fullWidth>
          <Tab key="general" title="General">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-2">
              <Input label="Campaign Name" placeholder="Enter campaign name" defaultValue={currentCampaign} />
              <Input label="Sender Name" placeholder="Enter sender name" defaultValue="Marketing Team" />
              <Input label="Reply-to Email" placeholder="Enter reply-to email" defaultValue="marketing@example.com" />
              <Input type="url" label="Unsubscribe URL" placeholder="Enter unsubscribe URL" defaultValue="https://example.com/unsubscribe" />
            </div>
          </Tab>
          <Tab key="scheduling" title="Scheduling">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-2">
              <Input label="Start Date" placeholder="Select start date" type="date" />
              <Input label="Start Time" placeholder="Select start time" type="time" />
              <div className="sm:col-span-2 flex flex-col gap-2 mt-2">
                 <Checkbox defaultSelected>Send follow-up to non-openers</Checkbox>
                 <Checkbox>Throttle sending (avoid spam filters)</Checkbox>
              </div>
              <Input className="sm:col-span-2" label="Sending Rate" placeholder="Emails per hour" defaultValue="500" type="number" />
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
              <Input label="Google Analytics ID" placeholder="Enter GA ID" defaultValue="UA-XXXXX-Y" />
            </div>
          </Tab>
        </Tabs>
    </div>
  );
};
