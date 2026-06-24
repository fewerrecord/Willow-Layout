import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Keep this in sync with the Opt-in Message field filed on the A2P 10DLC
// campaign in the Twilio Console (Messaging > Regulatory Compliance > Campaigns).
const OPT_IN_MESSAGE =
  "Willowcreek Cafe: Reply YES to receive table-ready SMS alerts during your shifts. Msg & data rates may apply. Reply STOP to cancel.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { action, phone, tableLabel } = await req.json();

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
    const msgSid     = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");

    if (!accountSid || !authToken || !msgSid) {
      return json({ error: "Twilio config missing" }, 500);
    }

    const sendSms = (to: string, body: string) =>
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, MessagingServiceSid: msgSid, Body: body }).toString(),
      }).then((r) => r.json());

    // ── Opt-in request ────────────────────────────────────────────────────────
    if (action === "optin-request") {
      if (!phone) return json({ error: "phone required" }, 400);

      // Upsert a pending row so the webhook can find this number later
      const sb = sb_service();
      await sb.from("servers").upsert({ phone, opted_in_at: null, do_not_text: false }, { onConflict: "phone", ignoreDuplicates: true });

      const data = await sendSms(phone, OPT_IN_MESSAGE);

      // Audit trail: proves when/why the opt-in invite was sent.
      await sb.from("sms_consent_log").insert({ phone, event_type: "opt_in_requested", raw_body: OPT_IN_MESSAGE });

      return json(data);
    }

    // ── Table alert ───────────────────────────────────────────────────────────
    if (action === "table-alert") {
      if (!phone || !tableLabel) return json({ error: "phone and tableLabel required" }, 400);

      const sb = sb_service();
      const { data: srv } = await sb
        .from("servers")
        .select("opted_in_at, do_not_text")
        .eq("phone", phone)
        .maybeSingle();

      if (!srv?.opted_in_at || srv.do_not_text) {
        return json({ skipped: true, reason: "not opted in or do_not_text set" });
      }

      const data = await sendSms(
        phone,
        `Willowcreek Cafe: Table ${tableLabel} is ready for you. Msg frequency varies, msg & data rates may apply. Reply STOP to cancel, HELP for help.`
      );
      return json(data);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function sb_service() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
