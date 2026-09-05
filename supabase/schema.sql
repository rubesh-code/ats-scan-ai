-- ATS SaaS production MVP schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'User',
  email text not null unique,
  credits integer not null default 0 check (credits >= 0),
  total_scans integer not null default 0 check (total_scans >= 0),
  avg_score numeric not null default 0 check (avg_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  verified boolean not null default false,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_codes_email_created_at
on public.otp_codes(email, created_at desc);

create table if not exists public.credit_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_inr integer not null check (price_inr > 0),
  credits integer not null check (credits > 0),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  package_id uuid not null references public.credit_packages(id),
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  razorpay_signature text,
  amount_inr integer not null,
  credits integer not null,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists idx_payments_user_id_created_at
on public.payments(user_id, created_at desc);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  scan_id uuid,
  type text not null,
  credits integer not null,
  description text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_credit_transactions_payment_purchase
on public.credit_transactions(payment_id, type)
where payment_id is not null and type = 'purchase';

create table if not exists public.uploaded_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_url text,
  file_path text,
  file_name text not null,
  file_type text not null,
  file_size integer,
  extracted_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_uploaded_resumes_user_id_created_at
on public.uploaded_resumes(user_id, created_at desc);

create table if not exists public.job_roles (
  id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  required_skills text[] not null default '{}',
  keywords text[] not null default '{}',
  experience_level text,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  resume_id uuid references public.uploaded_resumes(id) on delete set null,
  filename text not null,
  score integer not null default 0 check (score >= 0 and score <= 100),
  status text not null default 'Completed',
  type text,
  job_description text,
  job_role_id uuid references public.job_roles(id) on delete set null,
  result_data jsonb,
  credit_used integer not null default 1,
  date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_scans_user_id_date
on public.scans(user_id, date desc);

-- Make storage bucket for private resumes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Seed the production starter package: Rs. 29 = 10 credits.
insert into public.credit_packages (name, price_inr, credits, status)
select 'Starter Pack', 29, 10, 'active'
where not exists (
  select 1 from public.credit_packages where price_inr = 29 and credits = 10
);

-- Seed common job roles.
insert into public.job_roles (role_name, required_skills, keywords, experience_level, description, status)
values
  ('React Developer', array['React','TypeScript','JavaScript','HTML','CSS','REST API','Git'], array['React','TypeScript','REST API','responsive UI','components','frontend performance'], 'Junior to Mid', 'Frontend role focused on React applications and reusable UI components.', 'active'),
  ('Laravel Developer', array['Laravel','PHP','MySQL','REST API','Queues','Git'], array['Laravel','PHP','Eloquent','API','MySQL','Redis'], 'Junior to Mid', 'Backend role focused on Laravel APIs, database work, and server-side features.', 'active'),
  ('Data Analyst', array['SQL','Excel','Power BI','Python','Statistics'], array['SQL','dashboards','reporting','KPIs','data visualization'], 'Entry to Mid', 'Data role focused on reporting, dashboards, and insights.', 'active'),
  ('HR Executive', array['Recruitment','Onboarding','HRMS','Communication'], array['talent acquisition','employee relations','payroll','onboarding'], 'Entry to Mid', 'HR role focused on recruitment and employee operations.', 'active'),
  ('Digital Marketing Executive', array['SEO','Google Ads','Meta Ads','Analytics','Content'], array['SEO','SEM','campaigns','conversion','analytics'], 'Entry to Mid', 'Marketing role focused on campaigns, SEO, paid ads, and analytics.', 'active')
on conflict (role_name) do nothing;

-- Atomic function to save scan + deduct one credit + update averages.
create or replace function public.complete_resume_scan(
  p_user_id uuid,
  p_resume_id uuid,
  p_filename text,
  p_score integer,
  p_type text,
  p_job_description text,
  p_job_role_id uuid,
  p_result_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_credits integer;
  v_total_scans integer;
  v_avg_score numeric;
  v_new_total integer;
  v_new_avg numeric;
  v_scan_id uuid;
begin
  select credits, total_scans, avg_score
  into v_current_credits, v_total_scans, v_avg_score
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User not found';
  end if;

  if v_current_credits <= 0 then
    raise exception 'Insufficient credits';
  end if;

  v_new_total := coalesce(v_total_scans, 0) + 1;
  v_new_avg := ((coalesce(v_avg_score, 0) * coalesce(v_total_scans, 0)) + p_score) / v_new_total;

  insert into public.scans (
    user_id,
    resume_id,
    filename,
    score,
    status,
    type,
    job_description,
    job_role_id,
    result_data,
    credit_used
  ) values (
    p_user_id,
    p_resume_id,
    p_filename,
    p_score,
    'Completed',
    p_type,
    p_job_description,
    p_job_role_id,
    p_result_data,
    1
  ) returning id into v_scan_id;

  update public.users
  set
    credits = credits - 1,
    total_scans = v_new_total,
    avg_score = round(v_new_avg, 2),
    updated_at = now()
  where id = p_user_id;

  insert into public.credit_transactions (
    user_id,
    scan_id,
    type,
    credits,
    description
  ) values (
    p_user_id,
    v_scan_id,
    'scan',
    -1,
    'Resume analysis credit used'
  );

  return v_scan_id;
end;
$$;

-- Spend one credit for an improved-resume rewrite.
-- Decrement and log in a single statement so two parallel requests cannot
-- both spend the last credit.
create or replace function public.spend_credit_for_resume_rewrite(
  p_user_id uuid,
  p_scan_id uuid
)
returns integer
language plpgsql
security definer
as $$
declare
  v_remaining integer;
begin
  update public.users
  set
    credits = credits - 1,
    updated_at = now()
  where id = p_user_id and credits > 0
  returning credits into v_remaining;

  if v_remaining is null then
    raise exception 'Insufficient credits';
  end if;

  insert into public.credit_transactions (
    user_id,
    scan_id,
    type,
    credits,
    description
  ) values (
    p_user_id,
    p_scan_id,
    'resume_rewrite',
    -1,
    'Improved resume generated'
  );

  return v_remaining;
end;
$$;

-- RLS: backend service role bypasses this; these policies are for safe direct client access if used later.
alter table public.users enable row level security;
alter table public.otp_codes enable row level security;
alter table public.credit_packages enable row level security;
alter table public.payments enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.uploaded_resumes enable row level security;
alter table public.job_roles enable row level security;
alter table public.scans enable row level security;

drop policy if exists "credit packages are readable" on public.credit_packages;
create policy "credit packages are readable" on public.credit_packages for select using (status = 'active');

drop policy if exists "job roles are readable" on public.job_roles;
create policy "job roles are readable" on public.job_roles for select using (status = 'active');
