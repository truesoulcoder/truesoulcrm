// src/components/campaign_dashboard/email-selector.tsx
import React from "react";
import { Icon } from "@iconify/react";
import { Checkbox, Input, Button, ScrollShadow, Spinner } from "@heroui/react";
import useSWR from "swr";
import { fetcher } from "@/utils/fetcher";
import type { Tables } from "@/types/supabase";

type Campaign = Tables<'campaigns'>;

export const EmailSelector: React.FC = () => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const { data: campaigns, error } = useSWR<Campaign[]>('/api/campaigns', fetcher);
  const [selectedCampaigns, setSelectedCampaigns] = React.useState<Set<string>>(new Set());

  const handleToggleCampaign = (id: string) => {
    setSelectedCampaigns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  if (error) return <div>Failed to load lists</div>;
  if (!campaigns) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  const filteredLists = campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <Input
        placeholder="Search lists..."
        size="sm"
        startContent={<Icon icon="lucide:search" className="text-default-400" />}
        value={searchQuery}
        onValueChange={setSearchQuery}
      />

      <ScrollShadow className="flex-grow">
        <div className="space-y-2">
          {filteredLists.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center justify-between rounded-medium p-2 hover:bg-content2"
            >
              <Checkbox
                isSelected={selectedCampaigns.has(campaign.id)}
                onValueChange={() => handleToggleCampaign(campaign.id)}
                size="sm"
              >
                <div className="flex flex-col">
                  <span className="text-small">{campaign.name}</span>
                  <span className="text-tiny text-default-500 capitalize">{campaign.status}</span>
                </div>
              </Checkbox>
            </div>
          ))}
        </div>
      </ScrollShadow>

      <div className="mt-auto border-t border-divider pt-3 text-center">
        <p className="mb-2 text-small">
          <span className="font-medium">{selectedCampaigns.size}</span> lists selected
        </p>
        <Button size="sm" color="primary" fullWidth>
          Apply Selection
        </Button>
      </div>
    </div>
  );
};