// src/components/campaign_dashboard/campaign-status.tsx
import React from 'react';
import { Icon } from '@iconify/react';
import { Progress, Badge, Spinner } from '@heroui/react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';

interface CampaignStatusProps {
  isRunning: boolean;
  isPaused: boolean;
  currentCampaign: { id: string } | null;
}

export const CampaignStatus: React.FC<CampaignStatusProps> = ({
  isRunning,
  isPaused,
  currentCampaign,
}) => {
  const { data, error } = useSWR(
    currentCampaign
      ? `/api/engine/email-metrics?campaignId=${currentCampaign.id}`
      : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const getStatusColor = () => {
    if (!isRunning) return 'default';
    if (isPaused) return 'warning';
    return 'success';
  };

  const getStatusText = () => {
    if (!isRunning) return 'Inactive';
    if (isPaused) return 'Paused';
    return 'Active';
  };

  const getStatusIcon = () => {
    if (!isRunning) return 'lucide:circle';
    if (isPaused) return 'lucide:pause-circle';
    return 'lucide:play-circle';
  };

  const metrics = data?.data;

  if (error) return <div>Failed to load status</div>;
  if (!metrics && currentCampaign)
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  if (!currentCampaign)
    return (
      <div className="flex items-center justify-center h-full text-default-400">
        Select a campaign to view status.
      </div>
    );

  const totalRecipients = metrics.totals.sent + metrics.totals.failed;
  const sentPercentage =
    totalRecipients > 0
      ? (metrics.totals.delivered / totalRecipients) * 100
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge
          content={<Icon icon={getStatusIcon()} />}
          color={getStatusColor()}
          placement="top-right"
          size="sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-default-100">
            <Icon
              icon="lucide:mail"
              width={24}
              height={24}
              className="text-default-500"
            />
          </div>
        </Badge>
        <div>
          <p className="text-small font-medium">Status</p>
          <p className="text-small text-default-500">{getStatusText()}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between">
            <p className="text-small">Delivered</p>
            <p className="text-small text-default-500">
              {sentPercentage.toFixed(0)}%
            </p>
          </div>
          <Progress
            aria-label="Sending progress"
            size="sm"
            value={sentPercentage}
            color="primary"
            className="max-w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between">
            <p className="text-small">Open Rate</p>
            <p className="text-small text-default-500">
              {metrics.rates.open_rate.toFixed(0)}%
            </p>
          </div>
          <Progress
            aria-label="Open rate"
            size="sm"
            value={metrics.rates.open_rate}
            color="success"
            className="max-w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between">
            <p className="text-small">Click Rate</p>
            <p className="text-small text-default-500">
              {metrics.rates.click_rate.toFixed(0)}%
            </p>
          </div>
          <Progress
            aria-label="Click rate"
            size="sm"
            value={metrics.rates.click_rate}
            color="secondary"
            className="max-w-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-small">Recipients</p>
          <p className="text-small font-medium">{totalRecipients}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-small">Delivered</p>
          <p className="text-small font-medium">{metrics.totals.delivered}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-small">Opened</p>
          <p className="text-small font-medium">{metrics.totals.opened}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-small">Clicked</p>
          <p className="text-small font-medium">{metrics.totals.clicked}</p>
        </div>
      </div>
    </div>
  );
};