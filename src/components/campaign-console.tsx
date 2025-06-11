"use client";

import React from "react";
import { Icon } from "@iconify/react";
import { Button, ScrollShadow } from "@heroui/react";

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

interface CampaignConsoleProps {
  isRunning: boolean;
  isPaused: boolean;
}

export const CampaignConsole: React.FC<CampaignConsoleProps> = ({ isRunning, isPaused }) => {
  const [logs, setLogs] = React.useState<LogEntry[]>([
    {
      id: 1,
      timestamp: "10:30:15",
      message: "Campaign engine initialized",
      type: "info",
    },
    {
      id: 2,
      timestamp: "10:30:16",
      message: "Loading email templates...",
      type: "info",
    },
    {
      id: 3,
      timestamp: "10:30:18",
      message: "Email templates loaded successfully",
      type: "success",
    },
    {
      id: 4,
      timestamp: "10:30:20",
      message: "Connecting to email service provider...",
      type: "info",
    },
    {
      id: 5,
      timestamp: "10:30:22",
      message: "Connection established",
      type: "success",
    },
  ]);

  const logEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [logs]);

  React.useEffect(() => {
    if (!isRunning || isPaused) return;

    const messages = [
      "Sending batch of 50 emails...",
      "Batch completed successfully",
      "Processing analytics data...",
      "Checking bounce rates...",
      "Optimizing send rate based on engagement...",
      "Updating campaign statistics...",
      "Checking for unsubscribes...",
      "Preparing next batch of emails...",
    ];

    const types: ("info" | "success" | "warning" | "error")[] = [
      "info",
      "success",
      "info",
      "info",
      "info",
      "success",
      "info",
      "info",
    ];

    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * messages.length);
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setLogs((prevLogs) => [
        ...prevLogs,
        {
          id: prevLogs.length + 1,
          timestamp,
          message: messages[randomIndex],
          type: types[randomIndex],
        },
      ]);
    }, 3000);

    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  const getIconForType = (type: string) => {
    switch (type) {
      case "info":
        return <Icon icon="lucide:info" className="text-primary-500" />;
      case "success":
        return <Icon icon="lucide:check-circle" className="text-success-500" />;
      case "warning":
        return <Icon icon="lucide:alert-triangle" className="text-warning-500" />;
      case "error":
        return <Icon icon="lucide:x-circle" className="text-danger-500" />;
      default:
        return <Icon icon="lucide:circle" className="text-default-500" />;
    }
  };

  const clearLogs = () => {
    setLogs([
      {
        id: 1,
        timestamp: new Date().toLocaleTimeString(),
        message: "Console cleared",
        type: "info",
      },
    ]);
  };

  return (
    <div className="flex h-[240px] flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              isRunning && !isPaused ? "bg-success-500" : "bg-default-300"
            }`}
          />
          <span className="text-small">
            {isRunning ? (isPaused ? "Paused" : "Running") : "Stopped"}
          </span>
        </div>
        <Button size="sm" variant="flat" onPress={clearLogs}>
          Clear
        </Button>
      </div>

      <ScrollShadow className="h-full rounded-medium bg-content2 p-3 font-mono text-xs">
        {logs.map((log) => (
          <div key={log.id} className="mb-1 flex items-start gap-2">
            <span className="text-default-400">[{log.timestamp}]</span>
            <span className="mt-0.5 flex-shrink-0">{getIconForType(log.type)}</span>
            <span>{log.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </ScrollShadow>
    </div>
  );
};