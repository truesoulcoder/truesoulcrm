import { NextApiRequest, NextApiResponse } from 'next';

import { createClient } from '@/lib/supabase/server';

type EmailStatus = 'sent' | 'delivered' | 'bounced' | 'opened' | 'clicked' | 'replied';
type TimeRange = '24h' | '7d' | '30d';

interface EmailMetric {
  sender_email_used: string | null;
  sender_name: string | null;
  email_status: string | null;
  count: number;
}

interface MetricTotals {
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  replied: number;
}

interface MetricRates {
  delivery: number;
  bounce: number;
  open: number;
  click: number;
  reply: number;
}

interface SenderMetrics extends MetricTotals {
  email: string;
  name: string;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

interface ApiResponse {
  success: boolean;
  data?: {
    totals: MetricTotals;
    rates: MetricRates;
    bySender: SenderMetrics[];
    timeSeries: any[];
  };
  error?: string;
}

class EmailMetricsError extends Error {
  status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = 'EmailMetricsError';
    this.status = status;
  }
}

const isValidEmailStatus = (status: string | null): status is EmailStatus => {
  return [
    'sent', 'delivered', 'bounced', 
    'opened', 'clicked', 'replied'
  ].includes(status || '');
};

const calculateTotals = (metrics: EmailMetric[]): MetricTotals => {
  const totals: MetricTotals = { 
    sent: 0, 
    delivered: 0, 
    bounced: 0, 
    opened: 0, 
    clicked: 0, 
    replied: 0 
  };

  for (const metric of metrics) {
    const status = metric.email_status?.toLowerCase();
    const count = metric.count || 0;
    
    if (status && isValidEmailStatus(status)) {
      totals[status] = (totals[status] || 0) + count;
    }
    totals.sent += count;
  }

  return totals;
};

const calculateRates = (totals: MetricTotals): MetricRates => ({
  delivery: totals.sent > 0 ? Number(((totals.delivered / totals.sent) * 100).toFixed(2)) : 0,
  bounce: totals.sent > 0 ? Number(((totals.bounced / totals.sent) * 100).toFixed(2)) : 0,
  open: totals.delivered > 0 ? Number(((totals.opened / totals.delivered) * 100).toFixed(2)) : 0,
  click: totals.delivered > 0 ? Number(((totals.clicked / totals.delivered) * 100).toFixed(2)) : 0,
  reply: totals.delivered > 0 ? Number(((totals.replied / totals.delivered) * 100).toFixed(2)) : 0
});

const processSenderMetrics = (metrics: EmailMetric[]): SenderMetrics[] => {
  const senderMap = new Map<string, SenderMetrics>();

  for (const metric of metrics) {
    const email = metric.sender_email_used || 'unknown@example.com';
    const status = metric.email_status?.toLowerCase();
    const count = metric.count || 0;

    let sender = senderMap.get(email);
    if (!sender) {
      sender = {
        email,
        name: metric.sender_name || email.split('@')[0],
        sent: 0, 
        delivered: 0, 
        bounced: 0,
        opened: 0, 
        clicked: 0, 
        replied: 0,
        deliveryRate: 0, 
        bounceRate: 0, 
        openRate: 0,
        clickRate: 0, 
        replyRate: 0
      };
      senderMap.set(email, sender);
    }

    if (status && isValidEmailStatus(status)) {
      sender[status] = (sender[status] || 0) + count;
    }
    sender.sent += count;
  }

  return Array.from(senderMap.values()).map(sender => {
    const { sent, delivered, bounced, opened, clicked, replied } = sender;
    const rates = calculateRates({ sent, delivered, bounced, opened, clicked, replied });
    
    return {
      ...sender,
      ...rates,
      deliveryRate: rates.delivery,
      bounceRate: rates.bounce,
      openRate: rates.open,
      clickRate: rates.click,
      replyRate: rates.reply
    };
  });
};

const getDateRange = (timeRange: string): Date => {
  const date = new Date();
  const days = timeRange === '24h' ? 1 : timeRange === '30d' ? 30 : 7;
  date.setDate(date.getDate() - days);
  return date;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ 
      success: false, 
      error: `Method ${req.method} Not Allowed` 
    });
  }

  try {
    const { timeRange = '7d' } = req.query as { timeRange?: string };
    const startDate = getDateRange(timeRange);
    const supabase = createClient();

    // Define types for our metrics
    type SenderMetric = {
      sender_email_used: string | null;
      sender_name: string | null;
      email_status: string | null;
      count: number;
    };

    type TimeSeriesPoint = any; // Replace with actual type if known

    try {
      // Get the Supabase client instance
      const client = supabase;
      
      // Type assertions for Supabase client methods
      const supabaseClient = client as unknown as {
        from: (table: string) => {
          select: (fields: string) => {
            gte: (field: string, value: string) => {
              group: (...fields: string[]) => Promise<{
                data: SenderMetric[] | null;
                error: any;
              }>;
            };
          };
        };
        rpc: (fn: string, params: any) => Promise<{
          data: any[] | null;
          error: any;
        }>;
      };
      
      // Execute queries in parallel
      const [
        { data: senderData, error: senderError },
        { data: timeSeriesData, error: timeSeriesError }
      ] = await Promise.all([
        supabaseClient
          .from('eli5_email_log')
          .select('sender_email_used, sender_name, email_status, count(*)')
          .gte('created_at', startDate.toISOString())
          .group('sender_email_used', 'sender_name', 'email_status'),
        
        supabaseClient.rpc('get_email_metrics_time_series', {
          start_date: startDate.toISOString(),
          end_date: new Date().toISOString(),
          interval_days: timeRange === '24h' ? 1 : timeRange === '7d' ? 1 : 7
        })
      ]);

      if (senderError) {
        throw new EmailMetricsError(
          `Failed to fetch sender metrics: ${senderError.message}`, 
          500
        );
      }

      // Handle time series error without failing the whole request
      if (timeSeriesError) {
        console.warn('Time series data not available:', timeSeriesError.message);
      }

      // Process the data
      const metrics = senderData || [];
      const bySender = processSenderMetrics(metrics as unknown as EmailMetric[]);
      const totals = calculateTotals(metrics as unknown as EmailMetric[]);
      const rates = calculateRates(totals);

      return res.status(200).json({
        success: true,
        data: {
          totals,
          rates,
          bySender,
          timeSeries: timeSeriesData || []
        }
      });
    } catch (error) {
      // Safely handle the error with proper type checking
      let status = 500;
      let message = 'An unknown error occurred';
      
      if (error instanceof EmailMetricsError) {
        status = error.status;
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle plain error objects that might not be instances of Error
        message = String((error as { message?: unknown }).message || 'An unknown error occurred');
      }
      
      console.error('Email metrics API error:', error);
      return res.status(status).json({ 
        success: false, 
        error: message 
      });
    }
  } catch (error) {
    // Safely handle the error with proper type checking
    let status = 500;
    let message = 'An unknown error occurred';
    
    if (error instanceof EmailMetricsError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'object' && error !== null) {
      // Handle plain error objects that might not be instances of Error
      message = String((error as { message?: unknown }).message || 'An unknown error occurred');
    }
    
    console.error('Email metrics API error:', error);
    return res.status(status).json({ 
      success: false, 
      error: message 
    });
  }
}