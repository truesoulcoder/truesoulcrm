'use client';

import React from "react";
import { Icon } from "@iconify/react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
  Tooltip,
} from "@heroui/react";
import { DraggableDashboard } from "./DraggableDashboard";

export const CampaignDashboard: React.FC = () => {
  const [isRunning, setIsRunning] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [currentCampaign, setCurrentCampaign] = React.useState("Summer Promotion");
  const [isEditMode, setIsEditMode] = React.useState(false);
  
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
                endContent={<Icon icon="lucide:chevron-down" className="text-small" />}
              >
                {currentCampaign}
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="Campaign selection" 
              onAction={(key) => setCurrentCampaign(key.toString())}
            >
              <DropdownItem key="Summer Promotion">Summer Promotion</DropdownItem>
              <DropdownItem key="New Product Launch">New Product Launch</DropdownItem>
              <DropdownItem key="Customer Feedback">Customer Feedback</DropdownItem>
              <DropdownItem key="Weekly Newsletter">Weekly Newsletter</DropdownItem>
            </DropdownMenu>
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