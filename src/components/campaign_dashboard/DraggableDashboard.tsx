'use client';

import React from "react";
import { Icon } from "@iconify/react";
import { Card, CardHeader, CardBody, Button } from "@heroui/react";
import { Responsive, WidthProvider } from "react-grid-layout";
import { CampaignChart } from "./campaign-chart";
import { CampaignConsole } from "./campaign-console";
import { CampaignStatus } from "./campaign-status";
import { EmailSelector } from "./email-selector";
import { TemplatePreview } from "./template-preview";
import { CampaignSettings } from "./campaign-settings";
import { LeadsTable } from "./leads-table";

// CSS imports for react-grid-layout
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardItem {
  i: string;
  title: string;
  subtitle: string;
  component: React.ReactNode;
}

interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
  moved?: boolean;
  isBounded?: boolean;
}

type Layouts = {
  lg: LayoutItem[];
  md: LayoutItem[];
  sm: LayoutItem[];
  [key: string]: LayoutItem[]; // For any additional breakpoints
};

interface DraggableDashboardProps {
  isRunning: boolean;
  isPaused: boolean;
  currentCampaign: string;
  isEditMode: boolean;
}

export const DraggableDashboard: React.FC<DraggableDashboardProps> = ({
  isRunning,
  isPaused,
  currentCampaign,
  isEditMode,
}) => {
  const dashboardItems: DashboardItem[] = [
    { i: "status", title: "Campaign Status", subtitle: "Current performance", component: <CampaignStatus isRunning={isRunning} isPaused={isPaused} /> },
    { i: "chart", title: "Performance Metrics", subtitle: "Last 7 days", component: <CampaignChart /> },
    { i: "emails", title: "Email Lists", subtitle: "Select target audience", component: <EmailSelector /> },
    { i: "console", title: "Console Log", subtitle: "Real-time campaign updates", component: <CampaignConsole isRunning={isRunning} isPaused={isPaused} /> },
    { i: "template", title: "Template Preview", subtitle: "Current email template", component: <TemplatePreview /> },
    { i: "settings", title: "Campaign Settings", subtitle: "Configure campaign parameters", component: <CampaignSettings currentCampaign={currentCampaign} /> },
    { i: "leads", title: "Campaign Leads", subtitle: "Manage your campaign leads", component: <LeadsTable /> },
  ];

  const defaultLayouts: Layouts = React.useMemo(() => ({
    lg: [ { i: "status", x: 0, y: 0, w: 1, h: 2 }, { i: "chart", x: 1, y: 0, w: 2, h: 2 }, { i: "emails", x: 3, y: 0, w: 1, h: 2 }, { i: "console", x: 0, y: 2, w: 2, h: 2 }, { i: "template", x: 2, y: 2, w: 2, h: 2 }, { i: "settings", x: 0, y: 4, w: 4, h: 2 }, { i: "leads", x: 0, y: 6, w: 4, h: 4 } ],
    md: [ { i: "status", x: 0, y: 0, w: 1, h: 2 }, { i: "chart", x: 1, y: 0, w: 2, h: 2 }, { i: "emails", x: 0, y: 2, w: 1, h: 2 }, { i: "console", x: 1, y: 2, w: 2, h: 2 }, { i: "template", x: 0, y: 4, w: 3, h: 2 }, { i: "settings", x: 0, y: 6, w: 3, h: 2 }, { i: "leads", x: 0, y: 8, w: 3, h: 4 } ],
    sm: [ { i: "status", x: 0, y: 0, w: 1, h: 2 }, { i: "chart", x: 0, y: 2, w: 1, h: 2 }, { i: "emails", x: 0, y: 4, w: 1, h: 2 }, { i: "console", x: 0, y: 6, w: 1, h: 2 }, { i: "template", x: 0, y: 8, w: 1, h: 2 }, { i: "settings", x: 0, y: 10, w: 1, h: 2 }, { i: "leads", x: 0, y: 12, w: 1, h: 4 } ],
  }), []);

  const [layouts, setLayouts] = React.useState(defaultLayouts);
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (isMounted) {
      try {
        const savedLayouts = JSON.parse(localStorage.getItem("dashboard-layouts") || "null");
        if (savedLayouts) {
          const completeLayouts = { ...defaultLayouts };
          Object.keys(completeLayouts).forEach((breakpoint) => {
            if (savedLayouts[breakpoint]) {
              completeLayouts[breakpoint as keyof typeof completeLayouts] = savedLayouts[breakpoint];
            }
          });
          setLayouts(completeLayouts);
        }
      } catch (e) {
        console.error("Could not parse dashboard layouts from localStorage", e);
      }
    }
  }, [isMounted, defaultLayouts]);

  const saveToLS = (key: string, value: Layouts) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  const handleLayoutChange = (currentLayout: LayoutItem[], allLayouts: Layouts) => {
    if (isEditMode) {
      setLayouts(allLayouts);
      saveToLS("dashboard-layouts", allLayouts);
    }
  };
  
  const resetLayout = () => {
    setLayouts(defaultLayouts);
    saveToLS("dashboard-layouts", defaultLayouts);
  };
  
  if (!isMounted) {
    return null;
  }

  return (
    <div className="relative">
      {isEditMode && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-content2 p-3">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:move" className="text-primary" />
            <span className="text-small font-medium">Drag cards to rearrange your dashboard layout</span>
          </div>
          <Button size="sm" variant="flat" color="danger" onPress={resetLayout}>Reset Layout</Button>
        </div>
      )}

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 4, md: 3, sm: 1, xs: 1, xxs: 1 }}
        rowHeight={150}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        onLayoutChange={handleLayoutChange}
        margin={[16, 16]}
      >
        {dashboardItems.map((item) => (
          <div key={item.i}>
            <Card className="h-full transition-all duration-200">
              {isEditMode && (
                <div className="absolute inset-0 z-10 flex cursor-move items-center justify-center rounded-lg bg-foreground/5 opacity-0 transition-opacity hover:opacity-100" />
              )}
              <CardHeader className="flex gap-3 px-5 pb-0 pt-5">
                <div className="flex flex-col">
                  <p className="text-md font-semibold">{item.title}</p>
                  <p className="text-small text-default-500">{item.subtitle}</p>
                </div>
              </CardHeader>
              <CardBody>{item.component}</CardBody>
            </Card>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
};