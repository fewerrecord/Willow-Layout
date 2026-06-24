-- The live `servers` table only ever had a primary key on `id`. The edge
-- functions (send-sms, twilio-webhook) upsert with onConflict: "phone",
-- which requires a unique constraint on phone — without this, every
-- opt-in-request / YES / STOP upsert was failing with a Postgres error
-- ("no unique or exclusion constraint matching the ON CONFLICT specification").
-- Verified no duplicate non-null phone values exist before adding this.
alter table public.servers
  add constraint servers_phone_key unique (phone);
