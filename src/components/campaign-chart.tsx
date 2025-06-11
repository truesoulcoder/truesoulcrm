"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

const data = [
  { name: "Mon", opens: 4000, clicks: 2400, bounces: 400 },
  { name: "Tue", opens: 3000, clicks: 1398, bounces: 210 },
  { name: "Wed", opens: 2000, clicks: 9800, bounces: 290 },
  { name: "Thu", opens: 2780, clicks: 3908, bounces: 200 },
  { name: "Fri", opens: 1890, clicks: 4800, bounces: 181 },
  { name: "Sat", opens: 2390, clicks: 3800, bounces: 250 },
  { name: "Sun", opens: 3490, clicks: 4300, bounces: 210 }
];

export const CampaignChart: React.FC = () => {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 10,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--heroui-primary-500))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--heroui-primary-500))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--heroui-success-500))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--heroui-success-500))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorBounces" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--heroui-danger-500))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--heroui-danger-500))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-default-200))" />
          <XAxis 
            dataKey="name" 
            axisLine={false}
            tickLine={false}
            style={{
              fontSize: "var(--heroui-font-size-tiny)",
            }}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            style={{
              fontSize: "var(--heroui-font-size-tiny)",
            }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(var(--heroui-content1))",
              borderColor: "hsl(var(--heroui-default-200))",
              borderRadius: "var(--heroui-radius-medium)",
              fontSize: "var(--heroui-font-size-small)",
            }}
          />
          <Legend 
            iconType="circle" 
            wrapperStyle={{
              fontSize: "var(--heroui-font-size-tiny)",
            }}
          />
          <Area
            type="monotone"
            dataKey="opens"
            stroke="hsl(var(--heroui-primary-500))"
            fillOpacity={1}
            fill="url(#colorOpens)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="clicks"
            stroke="hsl(var(--heroui-success-500))"
            fillOpacity={1}
            fill="url(#colorClicks)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="bounces"
            stroke="hsl(var(--heroui-danger-500))"
            fillOpacity={1}
            fill="url(#colorBounces)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};