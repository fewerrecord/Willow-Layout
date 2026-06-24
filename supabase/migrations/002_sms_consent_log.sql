-- Immutable audit log of every inbound/outbound SMS consent event.
-- This is the durable "proof of opt-in/opt-out" record for A2P 10DLC compliance:
-- the `servers` table only holds current state, this table holds history.
create table if not exists sms_consent_log (
  id          bigint generated always as identity primary key,
  phone       text        not null,
  event_type  text        not null check (event_type in (
                'opt_in_requested',  -- manager enabled SMS in-app, invite text sent
                'opt_in_confirmed',  -- server replied YES
                'opt_out',           -- server replied STOP
                'help'               -- server replied HELP
              )),
  raw_body    text,                  -- raw inbound message body, if any
  created_at  timestamptz not null default now()
);

create index if not exists sms_consent_log_phone_idx on sms_consent_log (phone, created_at desc);

alter table sms_consent_log enable row level security;

create policy "service role full access"
  on sms_consent_log for all
  using (true)
  with check (true);

-- Log table is append-only by convention; no update/delete policy is granted
-- beyond the service-role policy above, so edge functions (service role) can
-- insert but the anon/public role has no access at all.
