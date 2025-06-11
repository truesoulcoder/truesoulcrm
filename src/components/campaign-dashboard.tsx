import * as React from "react";
import { Icon } from "@iconify/react";
import {
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
  Badge,
  Progress,
  Tabs,
  Tab,
  Checkbox,
  Input,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { CampaignChart } from "./campaign-chart";
import { CampaignConsole } from "./campaign-console";
import { CampaignStatus } from "./campaign-status";
import { EmailSelector } from "./email-selector";
import { TemplatePreview } from "./template-preview";
import { Tooltip } from "@heroui/react";
import { DraggableDashboard } from "./draggable-dashboard";
import { LeadsTable } from "./leads-table";
import { FC } from 'react';

interface CampaignDashboardProps {}

const CampaignDashboard: FC<CampaignDashboardProps> = () => {
  const [isRunning, setIsRunning] = React.useState<boolean>(false);
  const [isPaused, setIsPaused] = React.useState<boolean>(false);
  const [currentCampaign, setCurrentCampaign] = React.useState<string>("Summer Promotion");
  const [isEditMode, setIsEditMode] = React.useState<boolean>(false);

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleStop = () => {
    setIsRunning(false);
    setIsPaused(false);
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campaign Dashboard</h1>
          <p className="text-small text-default-500">Manage and monitor your email campaigns</p>
        </div>
        <div className="flex items-center gap-3">
          <Tooltip content={isEditMode ? "Exit Layout Edit Mode" : "Customize Dashboard Layout"}>
            <Button
              variant="flat"
              color={isEditMode ? "primary" : "default"}
              startContent={<Icon icon={isEditMode ? "lucide:check" : "lucide:layout"} />}
              onPress={() => setIsEditMode(!isEditMode)}
            >
              {isEditMode ? "Save Layout" : "Edit Layout"}
            </Button>
          </Tooltip>

          <Dropdown>
            <DropdownTrigger>
              <Button 
                variant="flat"
                endContent={<Icon icon="lucide:chevron-down" />}
              >
                {currentCampaign}
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="Campaign selection"
              items={[
                { key: 'Summer Promotion', label: 'Summer Promotion' },
                { key: 'Winter Sale', label: 'Winter Sale' },
                { key: 'New Product Launch', label: 'New Product Launch' }
              ]}
              onAction={(key: string) => setCurrentCampaign(key)}
            />
          </Dropdown>

          {!isRunning ? (
            <Button
              color="primary"
              startContent={<Icon icon="lucide:play" />}
              onPress={handleStart}
            >
              Start Campaign
            </Button>
          ) : isPaused ? (
            <div className="flex gap-2">
              <Button
                color="primary"
                variant="flat"
                startContent={<Icon icon="lucide:play" />}
                onPress={handleResume}
              >
                Resume
              </Button>
              <Button
                color="danger"
                variant="flat"
                startContent={<Icon icon="lucide:square" />}
                onPress={handleStop}
              >
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                color="warning"
                variant="flat"
                startContent={<Icon icon="lucide:pause" />}
                onPress={handlePause}
              >
                Pause
              </Button>
              <Button
                color="danger"
                variant="flat"
                startContent={<Icon icon="lucide:square" />}
                onPress={handleStop}
              >
                Stop
              </Button>
            </div>
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

export default CampaignDashboard;
