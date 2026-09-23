create extension if not exists pgcrypto;

create table if not exists public.cmss_quotes (
  id uuid primary key,
  quote_number text not null unique,
  request_fingerprint text not null unique,
  quote jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cmss_quote_deliveries (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.cmss_quotes(id) on delete restrict,
  audience text not null check (audience in ('customer','team')),
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','retry','accepted','delivered','delayed','bounced','complained','review')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  provider_id text unique,
  provider_event_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, audience)
);

create table if not exists public.cmss_quote_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  request_count integer not null
);

alter table public.cmss_quotes enable row level security;
alter table public.cmss_quote_deliveries enable row level security;
alter table public.cmss_quote_rate_limits enable row level security;
revoke all on public.cmss_quotes, public.cmss_quote_deliveries, public.cmss_quote_rate_limits from public, anon, authenticated;
grant select, insert, update on public.cmss_quotes, public.cmss_quote_deliveries, public.cmss_quote_rate_limits to service_role;

create or replace function public.cmss_quote_take_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare row_value public.cmss_quote_rate_limits;
begin
  insert into public.cmss_quote_rate_limits(key, window_start, request_count) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when public.cmss_quote_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) then now() else public.cmss_quote_rate_limits.window_start end,
    request_count = case when public.cmss_quote_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else public.cmss_quote_rate_limits.request_count + 1 end
  returning * into row_value;
  return row_value.request_count <= p_limit;
end $$;

create or replace function public.cmss_quote_enqueue(p_quote jsonb, p_fingerprint text, p_customer_payload jsonb, p_team_payload jsonb)
returns table(quote_number text, created boolean, delivery_ids uuid[]) language plpgsql security invoker set search_path = '' as $$
declare qid uuid := (p_quote->>'id')::uuid; qnumber text := p_quote->>'number'; was_created boolean := false; ids uuid[];
begin
  insert into public.cmss_quotes(id, quote_number, request_fingerprint, quote) values (qid, qnumber, p_fingerprint, p_quote)
  on conflict (request_fingerprint) do nothing;
  was_created := found;
  if not was_created then select id, cmss_quotes.quote_number into qid, qnumber from public.cmss_quotes where request_fingerprint = p_fingerprint; end if;
  if was_created then
    insert into public.cmss_quote_deliveries(quote_id, audience, payload) values (qid, 'customer', p_customer_payload), (qid, 'team', p_team_payload);
  end if;
  select array_agg(id order by audience) into ids from public.cmss_quote_deliveries where quote_id = qid and state in ('pending','retry','sending');
  return query select qnumber, was_created, coalesce(ids, array[]::uuid[]);
end $$;

create or replace function public.cmss_quote_claim_delivery(p_id uuid)
returns setof public.cmss_quote_deliveries language plpgsql security invoker set search_path = '' as $$
declare token uuid := gen_random_uuid();
begin
  return query update public.cmss_quote_deliveries set state='sending', attempts=attempts+1, first_attempt_at=coalesce(first_attempt_at,now()), lease_token=token, lease_until=now()+interval '2 minutes', updated_at=now()
    where id=p_id and ((state in ('pending','retry') and next_attempt_at<=now()) or (state='sending' and lease_until<now())) returning *;
end $$;

create or replace function public.cmss_quote_accept_delivery(p_id uuid, p_lease_token uuid, p_provider_id text)
returns void language sql security invoker set search_path = '' as $$
  update public.cmss_quote_deliveries set state='accepted', provider_id=p_provider_id, lease_token=null, lease_until=null, updated_at=now() where id=p_id and lease_token=p_lease_token and state='sending';
$$;

create or replace function public.cmss_quote_fail_delivery(p_id uuid, p_lease_token uuid, p_retryable boolean, p_error text)
returns void language sql security invoker set search_path = '' as $$
  update public.cmss_quote_deliveries set state=case when p_retryable and attempts<5 then 'retry' else 'review' end, next_attempt_at=now()+make_interval(mins => least(60, power(2, attempts)::integer)), last_error=p_error, lease_token=null, lease_until=null, updated_at=now() where id=p_id and lease_token=p_lease_token and state='sending';
$$;

create or replace function public.cmss_quote_provider_event(p_provider_id text, p_state text, p_event_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_state not in ('delivered','delayed','bounced','complained') then raise exception 'invalid delivery state'; end if;
  update public.cmss_quote_deliveries set state=p_state, provider_event_id=p_event_id, updated_at=now() where provider_id=p_provider_id and provider_event_id is distinct from p_event_id;
end $$;

revoke all on function public.cmss_quote_take_rate_limit(text,integer,integer), public.cmss_quote_enqueue(jsonb,text,jsonb,jsonb), public.cmss_quote_claim_delivery(uuid), public.cmss_quote_accept_delivery(uuid,uuid,text), public.cmss_quote_fail_delivery(uuid,uuid,boolean,text), public.cmss_quote_provider_event(text,text,text) from public, anon, authenticated;
grant execute on function public.cmss_quote_take_rate_limit(text,integer,integer), public.cmss_quote_enqueue(jsonb,text,jsonb,jsonb), public.cmss_quote_claim_delivery(uuid), public.cmss_quote_accept_delivery(uuid,uuid,text), public.cmss_quote_fail_delivery(uuid,uuid,boolean,text), public.cmss_quote_provider_event(text,text,text) to service_role;

create index if not exists cmss_quote_delivery_queue on public.cmss_quote_deliveries(state, next_attempt_at, created_at);
