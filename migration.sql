-- ============================================================
-- Shared Whiteboard App - Supabase Migration
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Rooms table
create table if not exists rooms (
  id text primary key,
  created_at timestamptz default now()
);

-- Strokes table
create table if not exists strokes (
  id uuid default gen_random_uuid() primary key,
  room_id text references rooms(id) on delete cascade,
  user_id text not null,
  stroke_data jsonb not null,
  created_at timestamptz default now()
);

-- Index for fast room loading
create index if not exists idx_strokes_room_id on strokes(room_id);

-- RLS: allow all (lock down in production)
alter table rooms enable row level security;
alter table strokes enable row level security;

-- Drop existing policies if re-running
drop policy if exists "allow all" on rooms;
drop policy if exists "allow all" on strokes;

create policy "allow all" on rooms for all using (true) with check (true);
create policy "allow all" on strokes for all using (true) with check (true);
