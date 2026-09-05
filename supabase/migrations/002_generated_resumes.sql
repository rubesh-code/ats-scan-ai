-- Migration: history of generated (rewritten) resumes.
--
-- Run this on its own. Do NOT run the full supabase/schema.sql against a live
-- database.
--
-- Storing the structured resume rather than the rendered file means a user can
-- re-download a past resume without spending another credit or another model
-- call: the PDF is rebuilt from this row on demand.
--
-- Safe to run more than once.

create table if not exists public.generated_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete set null,
  source_file_name text,
  file_name text not null,
  applied_suggestions jsonb not null default '[]'::jsonb,
  resume_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_generated_resumes_user_created
on public.generated_resumes(user_id, created_at desc);

alter table public.generated_resumes enable row level security;
