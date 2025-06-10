// src/app/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Responsive, WidthProvider, Layouts, Layout } from 'react-grid-layout';
import { Icon } from '@iconify/react';
import { Card, CardHeader, CardBody, Button, Tooltip, Spinner } from '@heroui/react'; // Added Spinner
import { Send, Users, Mail, BarChart2, Activity, Clock, Edit3, Save, RotateCcw, AlertTriangle } from 'lucide-react'; // Added AlertTriangle

// Import react-grid-layout CSS
import 'react-grid-layout/css/styles.css';
// Import react-resizable CSS (dependency of react-grid-layout)
import 'react-resizable/css/styles.css';

// Import new dashboard components
import CampaignChart from '@/components/dashboard/CampaignChart';
import CampaignConsole from '@/components/dashboard/CampaignConsole';
import RecentActivity from '@/components/dashboard/RecentActivity';
import QuickActions from '@/components/dashboard/QuickActions';

// Import data fetching functions
import { getTotalLeads, getActiveCampaigns, getEmailsSent, getOpenRate } from '@/lib/dashboard/data';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardItem {
  i: string;
  title: string;
  subtitle?: string;
  component: React.ReactNode;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
}

interface BentoStatCardProps {
  title: string;
  value?: string | number | null; // Allow undefined/null for initial loading
  prefix?: React.ReactNode;
  suffix?: string;
  isLoading: boolean;
  error?: string | null;
  trend?: 'up' | 'down';
  trendValue?: string;
  icon?: React.ReactNode; // Added icon to props
}

const BentoStatCard = ({ title, value, prefix, suffix, isLoading, error, trend, trendValue, icon }: BentoStatCardProps) => (
  <Card className="h-full flex flex-col"> {/* Ensure card takes full height of grid item */}
    <CardHeader className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      {icon}
    </CardHeader>
    <CardBody className="flex-grow flex flex-col items-center justify-center"> {/* Centered content */}
      {isLoading && <Spinner size="lg" />}
      {!isLoading && error && (
        <div className="text-center text-danger-500">
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          <p className="text-sm">Error: {error.substring(0, 100)}</p> {/* Show first 100 chars of error */}
        </div>
      )}
      {!isLoading && !error && value !== null && value !== undefined && (
        <>
          <div className="text-3xl font-bold">
            {prefix}
            {value}
            {suffix}
          </div>
          {trend && trendValue && (
            <p className={`text-sm mt-1 ${trend === 'up' ? 'text-success-500' : 'text-danger-500'}`}>
              {trend === 'up' ? '↗︎' : '↘︎'} {trendValue}
            </p>
          )}
        </>
      )}
      {!isLoading && !error && (value === null || value === undefined) && (
         <p className="text-neutral-500">No data available</p>
      )}
    </CardBody>
  </Card>
);

const BentoDashboardPage = () => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [layouts, setLayouts] = useState<Layouts>({});

  // States for fetched data
  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [totalLeadsLoading, setTotalLeadsLoading] = useState(true);
  const [totalLeadsError, setTotalLeadsError] = useState<string | null>(null);

  const [activeCampaigns, setActiveCampaigns] = useState<number | null>(null);
  const [activeCampaignsLoading, setActiveCampaignsLoading] = useState(true);
  const [activeCampaignsError, setActiveCampaignsError] = useState<string | null>(null);

  const [emailsSent, setEmailsSent] = useState<number | null>(null);
  const [emailsSentLoading, setEmailsSentLoading] = useState(true);
  const [emailsSentError, setEmailsSentError] = useState<string | null>(null);

  const [openRate, setOpenRate] = useState<number | null>(null);
  const [openRateLoading, setOpenRateLoading] = useState(true);
  const [openRateError, setOpenRateError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true); // For react-grid-layout and localStorage access
    
    async function fetchData() {
      // Fetch Total Leads
      try {
        setTotalLeadsLoading(true);
        const leads = await getTotalLeads();
        setTotalLeads(leads);
      } catch (e: any) {
        setTotalLeadsError(e.message);
      } finally {
        setTotalLeadsLoading(false);
      }

      // Fetch Active Campaigns
      try {
        setActiveCampaignsLoading(true);
        const campaigns = await getActiveCampaigns();
        setActiveCampaigns(campaigns);
      } catch (e: any) {
        setActiveCampaignsError(e.message);
      } finally {
        setActiveCampaignsLoading(false);
      }

      // Fetch Emails Sent
      try {
        setEmailsSentLoading(true);
        const sent = await getEmailsSent();
        setEmailsSent(sent);
      } catch (e: any) {
        setEmailsSentError(e.message);
      } finally {
        setEmailsSentLoading(false);
      }

      // Fetch Open Rate
      try {
        setOpenRateLoading(true);
        const rate = await getOpenRate();
        setOpenRate(rate);
      } catch (e: any) {
        setOpenRateError(e.message);
      } finally {
        setOpenRateLoading(false);
      }
    }

    fetchData();
  }, []);


  // Placeholder for dashboardItems, will be populated later
  const dashboardItems: DashboardItem[] = [
    {
      i: 'totalLeads',
      title: 'Total Leads',
      component: (
        <BentoStatCard
          title="Total Leads"
          value={totalLeads?.toLocaleString()}
          isLoading={totalLeadsLoading}
          error={totalLeadsError}
          icon={<Users className="h-6 w-6 text-primary-500" />}
          trend="up" // Trend data can remain mock or be fetched later
          trendValue="12.5%"
        />
      ),
      defaultSize: { w: 1, h: 1 },
      minSize: {w: 1, h: 1},
    },
    {
      i: 'activeCampaigns',
      title: 'Active Campaigns',
      component: (
        <BentoStatCard
          title="Active Campaigns"
          value={activeCampaigns?.toLocaleString()}
          isLoading={activeCampaignsLoading}
          error={activeCampaignsError}
          icon={<Send className="h-6 w-6 text-secondary-500" />}
          trend="up"
          trendValue="1 new"
        />
      ),
      defaultSize: { w: 1, h: 1 },
      minSize: {w: 1, h: 1},
    },
    {
      i: 'emailsSent',
      title: 'Emails Sent',
      component: (
        <BentoStatCard
          title="Emails Sent"
          value={emailsSent?.toLocaleString()}
          isLoading={emailsSentLoading}
          error={emailsSentError}
          icon={<Mail className="h-6 w-6 text-accent-500" />}
          trend="up"
          trendValue="8.2%"
        />
      ),
      defaultSize: { w: 1, h: 1 },
      minSize: {w: 1, h: 1},
    },
    {
      i: 'openRate',
      title: 'Open Rate',
      component: (
        <BentoStatCard
          title="Open Rate"
          value={openRate !== null ? openRate : undefined} // Handle null for openRate specifically if it can be 0
          suffix={openRate !== null ? "%" : undefined}
          isLoading={openRateLoading}
          error={openRateError}
          icon={<BarChart2 className="h-6 w-6 text-info-500" />}
          trend="up"
          trendValue="2.1%"
        />
      ),
      defaultSize: { w: 1, h: 1 },
      minSize: {w: 1, h: 1},
    },
    {
      i: 'campaignChart',
      title: 'Campaign Chart',
      component: <CampaignChart />,
      defaultSize: { w: 2, h: 2 },
      minSize: {w: 2, h: 2}, // Adjusted minSize
    },
    {
      i: 'campaignConsole',
      title: 'Campaign Console',
      component: <CampaignConsole />,
      defaultSize: { w: 2, h: 2 },
      minSize: {w: 1, h: 2}, // Adjusted minSize
    },
     {
      i: 'recentActivity',
      title: 'Recent Activity',
      component: <RecentActivity />,
      defaultSize: { w: 1, h: 2 },
      minSize: {w: 1, h: 2}, // Adjusted minSize
    },
    {
      i: 'quickActions',
      title: 'Quick Actions',
      component: <QuickActions />,
      defaultSize: { w: 1, h: 2 },
      minSize: {w: 1, h: 2}, // Adjusted minSize
    },
  ]; 

  // Placeholder for defaultLayouts, will be populated later
  const defaultLayouts: Layouts = {
    lg: [
      { i: 'totalLeads', x: 0, y: 0, w: 1, h: 1 },
      { i: 'activeCampaigns', x: 1, y: 0, w: 1, h: 1 },
      { i: 'emailsSent', x: 0, y: 1, w: 1, h: 1 },
      { i: 'openRate', x: 1, y: 1, w: 1, h: 1 },
      { i: 'campaignChart', x: 2, y: 0, w: 2, h: 2, minW: 2, minH: 2 }, // Adjusted minSize
      { i: 'campaignConsole', x: 0, y: 2, w: 2, h: 2, minW: 1, minH: 2 }, // Adjusted minSize
      { i: 'recentActivity', x: 2, y: 2, w: 1, h: 2, minW: 1, minH: 2 }, // Adjusted minSize
      { i: 'quickActions', x: 3, y: 2, w: 1, h: 2, minW: 1, minH: 2 }, // Adjusted minSize
    ],
    md: [ // Example for medium screens, adjust as needed
      { i: 'totalLeads', x: 0, y: 0, w: 1, h: 1 },
      { i: 'activeCampaigns', x: 1, y: 0, w: 1, h: 1 },
      { i: 'emailsSent', x: 0, y: 1, w: 1, h: 1 },
      { i: 'openRate', x: 1, y: 1, w: 1, h: 1 },
      { i: 'campaignChart', x: 0, y: 2, w: 2, h: 2, minW: 2, minH: 2 }, // Adjusted minSize
      { i: 'campaignConsole', x: 0, y: 4, w: 2, h: 2, minW: 1, minH: 2 }, // Adjusted minSize
      { i: 'recentActivity', x: 0, y: 6, w: 1, h: 2, minW: 1, minH: 2 }, // Adjusted minSize
      { i: 'quickActions', x: 1, y: 6, w: 1, h: 2, minW: 1, minH: 2 }, // Adjusted minSize
    ],
    sm: [
      { i: 'totalLeads', x: 0, y: 0, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'activeCampaigns', x: 0, y: 1, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'emailsSent', x: 0, y: 2, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'openRate', x: 0, y: 3, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'campaignChart', x: 0, y: 4, w: 1, h: 2, minW: 1, minH: 2 }, // sm: 1 col, w:1
      { i: 'campaignConsole', x: 0, y: 6, w: 1, h: 2, minW: 1, minH: 2 },// sm: 1 col, w:1
      { i: 'recentActivity', x: 0, y: 8, w: 1, h: 2, minW: 1, minH: 2 },// sm: 1 col, w:1
      { i: 'quickActions', x: 0, y: 10, w: 1, h: 2, minW: 1, minH: 2 },// sm: 1 col, w:1
    ],
    xs: [
      { i: 'totalLeads', x: 0, y: 0, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'activeCampaigns', x: 0, y: 1, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'emailsSent', x: 0, y: 2, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'openRate', x: 0, y: 3, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'campaignChart', x: 0, y: 4, w: 1, h: 2, minW: 1, minH: 2 },
      { i: 'campaignConsole', x: 0, y: 6, w: 1, h: 2, minW: 1, minH: 2 },
      { i: 'recentActivity', x: 0, y: 8, w: 1, h: 2, minW: 1, minH: 2 },
      { i: 'quickActions', x: 0, y: 10, w: 1, h: 2, minW: 1, minH: 2 },
    ],
    xxs: [
      { i: 'totalLeads', x: 0, y: 0, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'activeCampaigns', x: 0, y: 1, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'emailsSent', x: 0, y: 2, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'openRate', x: 0, y: 3, w: 1, h: 1, minW: 1, minH: 1 },
      { i: 'campaignChart', x: 0, y: 4, w: 1, h: 2, minW: 1, minH: 2 },
      { i: 'campaignConsole', x: 0, y: 6, w: 1, h: 2, minW: 1, minH: 2 },
      { i: 'recentActivity', x: 0, y: 8, w: 1, h: 2, minW: 1, minH: 2 },
      { i: 'quickActions', x: 0, y: 10, w: 1, h: 2, minW: 1, minH: 2 },
    ],
  };

  const getFromLS = (key: string): Layouts | undefined => {
    if (typeof window !== 'undefined') {
      const ls = localStorage.getItem(key);
      if (ls) return JSON.parse(ls);
    }
    return undefined;
  };

  const saveToLS = (key: string, value: Layouts) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  useEffect(() => {
    setMounted(true); 
    const storedLayouts = getFromLS('dashboardLayouts');
    if (storedLayouts) {
      setLayouts(storedLayouts);
    } else {
      setLayouts(defaultLayouts);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Changed dependency to [] for initial mount and LS load


  const handleLayoutChange = (currentLayout: Layout[], allLayouts: Layouts) => {
    if (isEditMode && mounted) {
      setLayouts(allLayouts); 
    }
  };

  const onSaveLayout = () => {
    if (mounted) {
      saveToLS('dashboardLayouts', layouts); 
      setIsEditMode(false);
    }
  };
  
  const onEditLayout = () => {
    setIsEditMode(true);
  }

  const resetLayout = () => {
    if (mounted) {
      setLayouts(defaultLayouts); 
      saveToLS('dashboardLayouts', defaultLayouts); 
    }
  };
  
  const synchronizedLayouts = useCallback(() => {
    const newLayouts: Layouts = {};
    for (const breakpoint of Object.keys(layouts)) {
      const currentBreakpointLayout = layouts[breakpoint] || [];
      const defaultBreakpointLayout = defaultLayouts[breakpoint] || [];
      
      const layoutMap = new Map(currentBreakpointLayout.map(l => [l.i, l]));
      
      const synchronizedBreakpointLayout = defaultBreakpointLayout.map(defaultItem => {
        return layoutMap.get(defaultItem.i) || defaultItem;
      });
      
      currentBreakpointLayout.forEach(currentItem => {
        if (!synchronizedBreakpointLayout.find(l => l.i === currentItem.i)) {
          synchronizedBreakpointLayout.push(currentItem);
        }
      });
      newLayouts[breakpoint] = synchronizedBreakpointLayout;
    }
    return newLayouts;
  }, [layouts, defaultLayouts]);


  useEffect(() => {
    if (mounted) {
      const currentLayouts = getFromLS('dashboardLayouts');
      if (currentLayouts) {
        let needsUpdate = false;
        for (const breakpointKey of Object.keys(defaultLayouts)) {
            const defaultItems = defaultLayouts[breakpointKey].map(item => item.i);
            const currentItems = (currentLayouts[breakpointKey] || []).map(item => item.i);
            if (defaultItems.some(itemKey => !currentItems.includes(itemKey))) {
                needsUpdate = true;
                break;
            }
        }
        if (needsUpdate) {
            const mergedLayouts = synchronizedLayouts();
            setLayouts(mergedLayouts);
            saveToLS('dashboardLayouts', mergedLayouts);
        } else {
            setLayouts(currentLayouts);
        }
      } else {
        setLayouts(defaultLayouts);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);


  if (!mounted) {
    return (
      <div className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-neutral-content/70">Welcome back! Here's what's happening with your campaigns.</p>
          </div>
        </div>
        <div className="text-center p-10">Loading dashboard layout...</div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-neutral-content/70">Welcome back! Here's what's happening with your campaigns.</p>
        </div>
        <div className="flex items-center gap-2">
          {!isEditMode ? (
            <Tooltip content="Edit Layout">
              <Button onClick={onEditLayout} variant="outline" size="sm" className="flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                Edit Layout
              </Button>
            </Tooltip>
          ) : (
            <>
              <Tooltip content="Save Layout">
                <Button onClick={onSaveLayout} variant="solid" color="primary" size="sm" className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Save Layout
                </Button>
              </Tooltip>
              <Tooltip content="Reset Layout">
                <Button onClick={resetLayout} variant="outline" color="danger" size="sm" className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 4, md: 3, sm: 1, xs: 1, xxs: 1 }} // Updated sm cols to 1
        rowHeight={150}
        draggableHandle=".drag-handle"
        onLayoutChange={handleLayoutChange}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms={mounted}
      >
        {dashboardItems.map((item) => (
          <div key={item.i} className={`bg-base-300 rounded-lg shadow-md overflow-hidden ${isEditMode ? 'cursor-move' : ''}`}>
            {isEditMode && (
              <div className="drag-handle bg-primary-500 text-primary-content p-1 text-center cursor-grab active:cursor-grabbing">
                <Icon icon="mdi:drag" className="inline-block h-5 w-5" /> {item.title}
              </div>
            )}
            <div className="p-1 h-full">
              {item.component}
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
};

export default BentoDashboardPage;
