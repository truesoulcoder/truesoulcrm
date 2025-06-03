// src/app/dashboard/page.tsx
'use client';

import { 
  Send, 
  Clock, 
  Users, 
  Mail,
  BarChart2,
  Activity,
} from 'lucide-react';

// Statistic component using DaisyUI
interface StatisticProps {
  title: string;
  value: string | number;
  prefix?: React.ReactNode;
  suffix?: string;
  className?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

const Statistic = ({ 
  title, 
  value, 
  prefix, 
  suffix = '', 
  className = '',
  trend,
  trendValue
}: StatisticProps) => (
  <div className={`stat ${className}`}>
    <div className="stat-figure text-primary">
      {prefix}
    </div>
    <div className="stat-title">{title}</div>
    <div className="stat-value text-2xl">{value}{suffix}</div>
    {trend && trendValue && (
      <div className={`stat-desc ${trend === 'up' ? 'text-success' : 'text-error'}`}>
        {trend === 'up' ? '↗︎' : '↘︎'} {trendValue}
      </div>
    )}
  </div>
);

const DashboardPage = () => {
  // Mock data - replace with real data from your API
  const stats = {
    totalLeads: 1245,
    activeCampaigns: 3,
    emailsSent: 8452,
    openRate: 68,
    clickRate: 12,
    replyRate: 4.5,
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-base-content/70">Welcome back! Here's what's happening with your campaigns.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="badge badge-primary gap-2">
            <Activity className="h-3.5 w-3.5" />
            Live Updates
          </div>
          <div className="badge badge-ghost gap-2">
            <Clock className="h-3.5 w-3.5" />
            Updated just now
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="card-body p-6">
            <Statistic
              title="Total Leads"
              value={stats.totalLeads.toLocaleString()}
              prefix={<Users className="h-8 w-8 text-primary" />}
              trend="up"
              trendValue="12.5% from last month"
            />
          </div>
        </div>

        <div className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="card-body p-6">
            <Statistic
              title="Active Campaigns"
              value={stats.activeCampaigns}
              prefix={<Send className="h-8 w-8 text-secondary" />}
              trend="up"
              trendValue="1 new this week"
            />
          </div>
        </div>

        <div className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="card-body p-6">
            <Statistic
              title="Emails Sent"
              value={stats.emailsSent.toLocaleString()}
              prefix={<Mail className="h-8 w-8 text-accent" />}
              trend="up"
              trendValue="8.2% from last week"
            />
          </div>
        </div>

        <div className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="card-body p-6">
            <Statistic
              title="Open Rate"
              value={stats.openRate}
              suffix="%"
              prefix={<BarChart2 className="h-8 w-8 text-info" />}
              trend="up"
              trendValue="2.1% from average"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign Stats */}
        <div className="card lg:col-span-2 bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="card-title">
              <Send className="h-5 w-5 text-primary" />
              <span>Campaign Performance</span>
            </div>
            
            <div className="space-y-6 mt-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Open Rate</span>
                  <span className="text-sm font-mono">{stats.openRate}%</span>
                </div>
                <progress 
                  className="progress progress-primary w-full h-2" 
                  value={stats.openRate} 
                  max="100"
                ></progress>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Click Rate</span>
                  <span className="text-sm font-mono">{stats.clickRate}%</span>
                </div>
                <progress 
                  className="progress progress-secondary w-full h-2" 
                  value={stats.clickRate} 
                  max="100"
                ></progress>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Reply Rate</span>
                  <span className="text-sm font-mono">{stats.replyRate}%</span>
                </div>
                <progress 
                  className="progress progress-accent w-full h-2" 
                  value={stats.replyRate} 
                  max="100"
                ></progress>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;