// src/components/campaign_dashboard/campaign-dashboard.tsx
'use client';

import React from 'react';
import { Icon } from '@iconify/react';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
  Tooltip,
} from '@heroui/react';
import { DraggableDashboard } from './DraggableDashboard';
import { ThemeToggleButton } from '@/components/ui/ThemeToggleButton';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import type { Tables } from '@/types/supabase';
import toast from 'react-hot-toast';

type Campaign = Tables<'campaigns'>;

export const CampaignDashboard: React.FC = () => {
  const { data: campaigns, error: campaignsError } = useSWR<Campaign[]>(
    '/api/campaigns',
    fetcher
  );
  const [currentCampaign, setCurrentCampaign] = React.useState<Campaign | null>(
    null
  );
  const [isRunning, setIsRunning] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (campaigns && campaigns.length > 0 && !currentCampaign) {
      setCurrentCampaign(campaigns[0]);
    }
  }, [campaigns, currentCampaign]);

  const handleAction = async (action: 'start' | 'pause' | 'stop' | 'resume') => {
    if (!currentCampaign) {
      toast.error('Please select a campaign first.');
      return;
    }
    setIsLoading(true);

    const endpoints = {
      start: '/api/engine/start-campaign',
      pause: '/api/engine/stop-campaign', // stop-campaign acts as pause
      stop: '/api/engine/stop-campaign',
      resume: '/api/engine/resume-campaign',
    };

    const endpoint = endpoints[action];
    const toastId = toast.loading(`Requesting to ${action} campaign...`);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: currentCampaign.id }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to perform action');
      }

      toast.success(
        `Campaign ${currentCampaign.name} action '${action}' successful.`,
        { id: toastId }
      );

      // Update UI state based on action
      if (action === 'start' || action === 'resume') {
        setIsRunning(true);
        setIsPaused(false);
      } else if (action === 'pause') {
        setIsPaused(true);
      } else if (action === 'stop') {
        setIsRunning(false);
        setIsPaused(false);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  if (campaignsError) {
    return (
      <div className="text-danger-500">
        Error loading campaigns: {campaignsError.message}
      </div>
    );
  }
  if (!campaigns) {
    return <div>Loading campaigns...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Campaign Dashboard
          </h1>
          <p className="text-small text-default-500">
            Manage and monitor your email campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <Tooltip content={isEditMode ? 'Save Layout' : 'Edit Layout'}>
            <Button
              variant="flat"
              isIconOnly
              color={isEditMode ? 'primary' : 'default'}
              onPress={() => setIsEditMode(!isEditMode)}
            >
              <Icon icon={isEditMode ? 'lucide:check' : 'lucide:layout'} />
            </Button>
          </Tooltip>

          <Dropdown>
            <DropdownTrigger>
              <Button
                variant="flat"
                endContent={<Icon icon="lucide:chevron-down" className="text-small" />}
              >
                {currentCampaign?.name || 'Select Campaign'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Campaign selection"
              onAction={(key) => {
                const selected = campaigns.find((c) => c.id === key);
                setCurrentCampaign(selected || null);
              }}
            >
              {campaigns.map((campaign) => (
                <DropdownItem key={campaign.id}>{campaign.name}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          {!isRunning ? (
            <Button
              color="primary"
              startContent={<Icon icon="lucide:play" />}
              onPress={() => handleAction('start')}
              isDisabled={isLoading || !currentCampaign}
            >
              Start
            </Button>
          ) : (
            <>
              {isPaused ? (
                <Button
                  color="success"
                  variant="flat"
                  startContent={<Icon icon="lucide:play" />}
                  onPress={() => handleAction('resume')}
                  isDisabled={isLoading}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  color="warning"
                  variant="flat"
                  startContent={<Icon icon="lucide:pause" />}
                  onPress={() => handleAction('pause')}
                  isDisabled={isLoading}
                >
                  Pause
                </Button>
              )}
              <Button
                color="danger"
                variant="flat"
                startContent={<Icon icon="lucide:square" />}
                onPress={() => handleAction('stop')}
                isDisabled={isLoading}
              >
                Stop
              </Button>
            </>
          )}
        </div>
      </div>

      <DraggableDashboard
        isRunning={isRunning}
        isPaused={isPaused}
        currentCampaign={currentCampaign}
        isEditMode={isEditMode}
      />
    </div>
  );
};