-- Server SMS consent table
-- Primary key is phone number so the Twilio webhook can look up by From number.
create table if not exists servers (
  phone        text        primary key,
  name         text,
  opted_in_at  timestamptz,
  do_not_text  boolean     not null default false,
  created_at   timestamptz not null default now()
);

-- Allow the anon/service role used by Edge Functions to read/write
alter table servers enable row level security;

create policy "service role full access"
  on servers for all
  using (true)
  with check (true);
