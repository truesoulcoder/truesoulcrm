import React from "react";
import { Icon } from "@iconify/react";
import { Progress, Badge } from "@heroui/react";

interface CampaignStatusProps {
  isRunning: boolean;
  isPaused: boolean;
}

export const CampaignStatus: React.FC<CampaignStatusProps> = ({ isRunning, isPaused }) => {
  const getStatusColor = () => {
    if (!isRunning) return "default";
    if (isPaused) return "warning";
    return "success";
  };

  const getStatusText = () => {
    if (!isRunning) return "Inactive";
    if (isPaused) return "Paused";
    return "Active";
  };

  const getStatusIcon = () => {
    if (!isRunning) return "lucide:circle";
    if (isPaused) return "lucide:pause-circle";
    return "lucide:play-circle";
  };

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
            <Icon icon="lucide:mail" width={24} height={24} className="text-default-500" />
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
            <p className="text-small">Sent</p>
            <p className="text-small text-default-500">65%</p>
          </div>
          <Progress
            aria-label="Sending progress"
            size="sm"
            value={65}
            color="primary"
            className="max-w-full"
          />
        </div>

        <div>
          <div className="mb-1 flex justify-between">
            <p className="text-small">Open Rate</p>
            <p className="text-small text-default-500">42%</p>
          </div>
          <Progress
            aria-label="Open rate"
            size="sm"
            value={42}
            color="success"
            className="max-w-full"
          />
        </div>

        <div>
          <div className="mb-1 flex justify-between">
            <p className="text-small">Click Rate</p>
            <p className="text-small text-default-500">18%</p>
          </div>
          <Progress
            aria-label="Click rate"
            size="sm"
            value={18}
            color="secondary"
            className="max-w-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-small">Total Recipients</p>
          <p className="text-small font-medium">10,000</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-small">Delivered</p>
          <p className="text-small font-medium">9,850</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-small">Opened</p>
          <p className="text-small font-medium">4,200</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-small">Clicked</p>
          <p className="text-small font-medium">1,800</p>
        </div>
      </div>
    </div>
  );
};