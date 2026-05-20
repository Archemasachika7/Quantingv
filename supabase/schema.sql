-- QuantingV Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Users / Profiles ────────────────────────────────────────────────────────
-- Extends Supabase Auth (auth.users) with app-specific fields
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    username    text unique,
    display_name text,
    avatar_url  text,
    created_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view own profile"     on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"   on public.profiles for update using (auth.uid() = id);
-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
    insert into public.profiles (id, username, display_name)
    values (new.id, split_part(new.email, '@', 1), split_part(new.email, '@', 1));
    return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ── Portfolios ───────────────────────────────────────────────────────────────
create table if not exists public.portfolios (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid references auth.users(id) on delete cascade,
    name            text not null default 'My Portfolio',
    initial_balance numeric(15,2) not null default 100000,
    currency        text not null default 'INR',
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);
alter table public.portfolios enable row level security;
create policy "Users manage own portfolios" on public.portfolios
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Trades ───────────────────────────────────────────────────────────────────
create table if not exists public.trades (
    id              uuid primary key default uuid_generate_v4(),
    portfolio_id    uuid references public.portfolios(id) on delete cascade,
    user_id         uuid references auth.users(id) on delete cascade,
    symbol          text not null,
    side            text not null check (side in ('BUY','SELL')),
    qty             numeric(18,6) not null,
    price           numeric(15,4) not null,
    pnl             numeric(15,4) default 0,
    strategy_name   text,
    notes           text,
    ts              timestamptz default now()
);
alter table public.trades enable row level security;
create policy "Users manage own trades" on public.trades
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_trades_portfolio on public.trades(portfolio_id);
create index if not exists idx_trades_user on public.trades(user_id);

-- ── Market Data (OHLCV) ──────────────────────────────────────────────────────
create table if not exists public.ohlcv (
    id      bigserial primary key,
    symbol  text not null,
    ts      date not null,
    open    numeric(18,6),
    high    numeric(18,6),
    low     numeric(18,6),
    close   numeric(18,6),
    volume  numeric(22,2),
    unique(symbol, ts)
);
-- Public read, service-role write (no RLS needed for market data)
create index if not exists idx_ohlcv_symbol_ts on public.ohlcv(symbol, ts desc);

-- ── Predictions Cache ────────────────────────────────────────────────────────
create table if not exists public.predictions (
    id              bigserial primary key,
    symbol          text not null,
    created_at      timestamptz default now(),
    horizon_days    int not null default 7,
    direction       text,
    confidence      numeric(5,4),
    price_low       numeric(18,4),
    price_high      numeric(18,4),
    forecast_price  numeric(18,4),
    model_name      text,
    ai_explanation  text,
    unique(symbol, horizon_days)
);
create index if not exists idx_predictions_symbol on public.predictions(symbol, created_at desc);

-- ── Sentiment ────────────────────────────────────────────────────────────────
create table if not exists public.sentiment (
    id          bigserial primary key,
    symbol      text,
    ts          timestamptz default now(),
    score       numeric(6,4),
    label       text,
    source      text,
    headline    text
);
create index if not exists idx_sentiment_symbol_ts on public.sentiment(symbol, ts desc);

-- ── Saved Strategies ────────────────────────────────────────────────────────
create table if not exists public.saved_strategies (
    id          uuid primary key default uuid_generate_v4(),
    user_id     uuid references auth.users(id) on delete cascade,
    name        text not null,
    code        text not null,
    description text,
    is_public   boolean default false,
    created_at  timestamptz default now()
);
alter table public.saved_strategies enable row level security;
create policy "Users manage own strategies" on public.saved_strategies
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Public strategies visible to all" on public.saved_strategies
    for select using (is_public = true);
