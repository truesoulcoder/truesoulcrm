// src/app/api/engine/email-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import { Database } from '@/types';

type EmailStatus = 'sent' | 'delivered' | 'bounced' | 'opened' | 'clicked' | 'replied' | 'failed';
type TimeRange = '24h' | '7d' | '30d' | 'all'; // Added 'all' for fetching all logs

interface RawLogDetail {
  status?: EmailStatus; // Status of the email attempt itself, e.g., 'sent', 'failed'
  email_event_type?: EmailStatus; // For specific events like 'opened', 'clicked' if logged this way
  sender_email_used?: string;
  sender_name?: string;
  // Other potential fields in details: error, messageId etc.
}

interface ProcessedEvent {
  sender_email_used: string;
  sender_name: string;
  status: EmailStatus; // The primary status for this event
  created_at_date: string; // 'YYYY-MM-DD'
}

interface MetricTotals {
  sent: number; // Total attempts or successful sends
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number; // Explicitly track failures
}

interface MetricRates {
  delivery_rate: number; // (delivered / sent) * 100
  bounce_rate: number;   // (bounced / sent) * 100
  open_rate: number;     // (opened / delivered) * 100
  click_rate: number;    // (clicked / delivered) * 100
  reply_rate: number;    // (replied / delivered) * 100
  failure_rate: number;  // (failed / sent) * 100
}

interface SenderMetrics extends MetricTotals {
  email: string;
  name: string;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  failureRate: number;
}

interface TimeSeriesDataPoint {
  date_group: string; // 'YYYY-MM-DD'
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number;
}

class EmailMetricsError extends Error {
  status: number;
  constructor(message: string, status: number = 500) {
    super(message);
    this.name = 'EmailMetricsError';
    this.status = status;
  }
}

const ALL_EMAIL_STATUSES: EmailStatus[] = ['sent', 'delivered', 'bounced', 'opened', 'clicked', 'replied', 'failed'];

function initializeMetricTotals(): MetricTotals {
  return { sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, failed: 0 };
}

const calculateTotals = (events: ProcessedEvent[]): MetricTotals => {
  const totals = initializeMetricTotals();
  for (const event of events) {
    if (ALL_EMAIL_STATUSES.includes(event.status)) {
      totals[event.status]++;
    }
    // Define what 'sent' means. If 'sent' is a specific status, it's counted above.
    // If 'sent' means any attempt, you might sum 'sent' + 'failed' + 'bounced' (if bounced is not part of sent)
    // For this refactor, assume 'sent' is a distinct status logged in details.
    // If not, this logic needs adjustment. Example: if all logs are attempts, then totals.sent = events.length;
  }
  // If 'sent' is not explicitly logged as a status for every attempt, but 'failed' and other success/intermediate statuses are:
  // totals.sent = totals.delivered + totals.bounced + totals.opened + totals.clicked + totals.replied + totals.failed; (Adjust based on actual logged statuses)

  // For now, let's assume 'sent' is a status like others. If a job log represents an *attempt* that resulted in 'sent' or 'failed',
  // then 'sent' should be the sum of successful sends.
  // If job_logs.details.status = 'sent' means a successful send:
  // totals.sent is already correctly counted.
  // If job_logs.details.status can be 'failed', then true "attempts" might be totals.sent + totals.failed.
  // Let's assume 'sent' in totals means successfully sent, and 'failed' means failed attempts.
  // The 'sent' count for rate calculation should be the base number of emails actually dispatched or attempted.
  // If a log with status 'sent' means it was successfully dispatched, that's our base for delivery rate.
  return totals;
};

const calculateRates = (totals: MetricTotals): MetricRates => {
  const baseSentForDelivery = totals.sent; // Emails successfully dispatched
  const baseDelivered = totals.delivered;   // Emails confirmed delivered

  return {
    delivery_rate: baseSentForDelivery > 0 ? Number(((totals.delivered / baseSentForDelivery) * 100).toFixed(2)) : 0,
    bounce_rate: baseSentForDelivery > 0 ? Number(((totals.bounced / baseSentForDelivery) * 100).toFixed(2)) : 0,
    open_rate: baseDelivered > 0 ? Number(((totals.opened / baseDelivered) * 100).toFixed(2)) : 0,
    click_rate: baseDelivered > 0 ? Number(((totals.clicked / baseDelivered) * 100).toFixed(2)) : 0,
    reply_rate: baseDelivered > 0 ? Number(((totals.replied / baseDelivered) * 100).toFixed(2)) : 0,
    failure_rate: (baseSentForDelivery + totals.failed) > 0 ? Number(((totals.failed / (baseSentForDelivery + totals.failed)) * 100).toFixed(2)) : 0, // Failed out of total attempts
  };
};

const processSenderMetrics = (events: ProcessedEvent[]): SenderMetrics[] => {
  const senderMap = new Map<string, MetricTotals & { name: string }>();

  for (const event of events) {
    const email = event.sender_email_used || 'unknown_sender';
    let senderData = senderMap.get(email);
    if (!senderData) {
      senderData = { ...initializeMetricTotals(), name: event.sender_name || email.split('@')[0] };
      senderMap.set(email, senderData);
    }
    if (ALL_EMAIL_STATUSES.includes(event.status)) {
      senderData[event.status]++;
    }
  }

  return Array.from(senderMap.entries()).map(([email, totals]) => {
    const rates = calculateRates(totals);
    return {
      email,
      name: totals.name,
      ...totals,
      deliveryRate: rates.delivery_rate,
      bounceRate: rates.bounce_rate,
      openRate: rates.open_rate,
      clickRate: rates.click_rate,
      replyRate: rates.reply_rate,
      failureRate: rates.failure_rate,
    };
  });
};

const getStartDateFromRange = (timeRange: TimeRange): Date | null => {
  if (timeRange === 'all') return null; // For fetching all logs
  const date = new Date();
  const days = timeRange === '24h' ? 1 : timeRange === '30d' ? 30 : 7;
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0); // Start of the day
  return date;
};

const generateTimeSeriesDataFromLogs = (
  logs: Database['public']['Tables']['job_logs']['Row'][],
  timeRange: TimeRange,
  endDate: Date = new Date()
): TimeSeriesDataPoint[] => {
  const seriesData: TimeSeriesDataPoint[] = [];
  const dailyAggregates: Map<string, MetricTotals> = new Map();

  const actualStartDate = getStartDateFromRange(timeRange);

  // Filter logs by actualStartDate if not 'all' timeRange
  const filteredLogs = actualStartDate
    ? logs.filter(log => new Date(log.created_at) >= actualStartDate)
    : logs;

  for (const log of filteredLogs) {
    const details = log.details as RawLogDetail | null;
    const status = details?.status || details?.email_event_type; // Prefer 'status' for send attempt, fallback to 'email_event_type'

    if (status && ALL_EMAIL_STATUSES.includes(status)) {
      const dateKey = new Date(log.created_at).toISOString().split('T')[0]; // 'YYYY-MM-DD'

      let dayEntry = dailyAggregates.get(dateKey);
      if (!dayEntry) {
        dayEntry = initializeMetricTotals();
        dailyAggregates.set(dateKey, dayEntry);
      }
      dayEntry[status]++;
    }
  }

  // Determine the true start date for generating the series (earliest log or calculated start date)
  let seriesStartDate = actualStartDate;
  if (timeRange === 'all' && filteredLogs.length > 0) {
      const earliestLogDate = new Date(filteredLogs.reduce((min, log) =>
          new Date(log.created_at) < new Date(min) ? log.created_at : min, filteredLogs[0].created_at
      ));
      earliestLogDate.setHours(0,0,0,0);
      seriesStartDate = earliestLogDate;
  }
  if (!seriesStartDate) seriesStartDate = new Date(endDate); // Should have a start date by now

  // Generate date series and populate with data
  let currentDate = new Date(seriesStartDate);
  endDate.setHours(0,0,0,0);

  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const totalsForDay = dailyAggregates.get(dateKey) || initializeMetricTotals();
    seriesData.push({
      date_group: dateKey,
      ...totalsForDay,
    });
    currentDate.setDate(currentDate.getDate() + 1); // Increment by one day
  }
  return seriesData.sort((a,b) => new Date(a.date_group).getTime() - new Date(b.date_group).getTime());
};


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const timeRange = (searchParams.get('timeRange') as TimeRange) || '7d';
  const supabase = createAdminServerClient<Database>();

  try {
    const startDateForOverallMetrics = getStartDateFromRange(timeRange); // For totals and bySender

    // Fetch all logs for the relevant period for overall/bySender, and potentially wider for timeSeries if 'all'
    let query = supabase.from('job_logs').select('details, created_at');
    if (startDateForOverallMetrics) { // Not 'all'
      query = query.gte('created_at', startDateForOverallMetrics.toISOString());
    }

    const { data: rawLogs, error: fetchError } = await query;

    if (fetchError) {
      throw new EmailMetricsError(`Error fetching job logs: ${fetchError.message}`, 500);
    }
    if (!rawLogs) {
      throw new EmailMetricsError('No job logs data received', 500);
    }

    const processedEvents: ProcessedEvent[] = rawLogs.map(log => {
      const details = log.details as RawLogDetail | null;
      // Prioritize 'status' from details (direct send attempt outcome), then 'email_event_type'
      const eventStatus = details?.status || details?.email_event_type || 'failed'; // Default to 'failed' if no status

      return {
        sender_email_used: details?.sender_email_used || 'Unknown Sender',
        sender_name: details?.sender_name || (details?.sender_email_used?.split('@')[0] || 'Unknown'),
        status: eventStatus,
        created_at_date: new Date(log.created_at).toISOString().split('T')[0],
      };
    }).filter(event => ALL_EMAIL_STATUSES.includes(event.status)); // Ensure status is one we track

    const totals = calculateTotals(processedEvents);
    const rates = calculateRates(totals);
    const bySender = processSenderMetrics(processedEvents);

    // For time series, we use all rawLogs fetched (which could be 'all' or limited by timeRange)
    // The generateTimeSeriesDataFromLogs function will handle date iteration based on timeRange
    const timeSeriesData = generateTimeSeriesDataFromLogs(rawLogs, timeRange);

    return NextResponse.json({
      success: true,
      data: { totals, rates, bySender, timeSeries: timeSeriesData },
    });

  } catch (error: any) {
    console.error('Error in email-metrics route:', error);
    if (error instanceof EmailMetricsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}