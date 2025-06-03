create table public.campaigns (
  campaign_id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  description text null,
  status text not null default 'draft'::text, 
  is_active boolean null default true,
  market_region text null,
  dry_run boolean null default false,
  limit_per_run integer null default 10,
  min_interval_seconds integer null default 180,
  max_interval_seconds integer null default 360,
  daily_limit integer null default 100,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint campaigns_pkey primary key (campaign_id),
) TABLESPACE pg_default;

create index IF not exists idx_campaigns_market_region on public.campaigns using btree (market_region) TABLESPACE pg_default;
create trigger update_campaigns_updated_at BEFORE
update on campaigns for EACH row
execute FUNCTION update_updated_at_column ();

