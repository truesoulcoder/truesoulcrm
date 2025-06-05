import { NextRequest, NextResponse } from 'next/server';

import { createAdminServerClient } from '@/lib/supabase/server';

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

const getDateRange = (timeRange: TimeRange): Date => {
  const date = new Date();
  const days = timeRange === '24h' ? 1 : timeRange === '30d' ? 30 : 7;
  date.setDate(date.getDate() - days);
  return date;
};

export async function GET(request: NextRequest) {
  // Extract query parameters from the URL
  const searchParams = request.nextUrl.searchParams;
  const timeRange = searchParams.get('timeRange') || '7d';
  
  try {
    const startDate = getDateRange(timeRange as TimeRange);
    const supabase = await createAdminServerClient();

    try {
      // Get the Supabase client instance
      const client = supabase;
      
      // Fetch metrics by sender and status
      const { data: metricsData, error: metricsError } = await client
        .from('engine_log')
        .select('sender_email_used, sender_name, email_status, count(*)', { 
          count: 'exact',
          head: false 
        })
        .gte('created_at', startDate.toISOString());

      if (metricsError) {
        throw new EmailMetricsError(`Error fetching email metrics: ${metricsError.message}`, 500);
      }

      // Fetch time series data (daily counts)
      const { data: timeSeriesData, error: timeSeriesError } = await client.rpc(
        'get_email_metrics_time_series',
        { start_date: startDate.toISOString() }
      );

      if (timeSeriesError) {
        throw new EmailMetricsError(`Error fetching time series data: ${timeSeriesError.message}`, 500);
      }

      // Process the metrics data
      if (!metricsData || !Array.isArray(metricsData)) {
        throw new EmailMetricsError('Invalid metrics data received', 500);
      }
            
      // Update the filter to handle both EmailMetric and ParserError types
      const metrics = metricsData.filter((item: unknown): item is EmailMetric => {
        if (typeof item !== 'object' || item === null) return false;
        if ('error' in item) return false; // Skip ParserError objects
        
        const metric = item as Record<string, unknown>;
        return (
          typeof metric.sender_email_used === 'string' &&
          typeof metric.sender_name === 'string' &&
          typeof metric.email_status === 'string' &&
          typeof metric.count === 'number'
        );
      });
      
      if (metrics.length === 0) {
        throw new EmailMetricsError('No valid email metrics found', 404);
      }
      const validMetrics = metrics.filter(metric => !('error' in metric));
      if (validMetrics.length === 0) {
        throw new EmailMetricsError('No valid email metrics found', 404);
      }
      
      const totals = calculateTotals(validMetrics);
      const rates = calculateRates(totals);
      const bySender = processSenderMetrics(validMetrics);

      // Return the processed data
      return NextResponse.json({
        success: true,
        data: {
          totals,
          rates,
          bySender,
          timeSeries: timeSeriesData || []
        }
      });
    } catch (error) {
      if (error instanceof EmailMetricsError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status }
        );
      }
      
      console.error('Unexpected error in email-metrics:', error);
      return NextResponse.json(
        { success: false, error: 'An unexpected error occurred while fetching email metrics.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in email-metrics route:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
