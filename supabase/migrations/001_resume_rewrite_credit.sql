-- Migration: credit spend for the improved-resume rewrite.
--
-- Run this on its own. Do NOT run the full supabase/schema.sql against a live
-- database: that file has drifted from production (it would re-seed the old
-- Rs. 29 credit package and overwrite complete_resume_scan).
--
-- Safe to run more than once.

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
  -- Decrement and read back in one statement so two parallel requests
  -- cannot both spend the last credit.
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
