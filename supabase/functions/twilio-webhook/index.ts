import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HELP_CONTACT = Deno.env.get("HELP_CONTACT") ?? "your manager";

serve(async (req) => {
  // Twilio POSTs application/x-www-form-urlencoded
  const form = await req.formData();
  const from = (form.get("From") as string ?? "").trim();
  const body = (form.get("Body") as string ?? "").trim().toUpperCase();

  if (!from) return twiml(); // nothing to do

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
  const msgSid     = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");

  const sendSms = async (to: string, text: string) => {
    if (!accountSid || !authToken || !msgSid) return;
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, MessagingServiceSid: msgSid, Body: text }).toString(),
    });
  };

  if (body === "YES") {
    await sb
      .from("servers")
      .upsert({ phone: from, opted_in_at: new Date().toISOString(), do_not_text: false }, { onConflict: "phone" });

    await sendSms(
      from,
      "Willowcreek Cafe: You're all set! You'll receive a text each time a table is seated at your station. Reply STOP anytime to opt out."
    );
  } else if (body === "STOP") {
    // Mirror in DB — Twilio handles carrier-level opt-out automatically
    await sb.from("servers").upsert({ phone: from, do_not_text: true }, { onConflict: "phone" });
  } else if (body === "HELP") {
    await sendSms(
      from,
      `Willowcreek Cafe: For help contact ${HELP_CONTACT}. Reply STOP to opt out.`
    );
  }

  // Always return empty TwiML so Twilio doesn't log an error
  return twiml();
});

function twiml() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}
