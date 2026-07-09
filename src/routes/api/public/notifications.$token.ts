import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/notifications/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("notifications_sent")
          .select("id,subject,body,sent_at,original_amount,updated_amount,fine_amount,interest_amount,overdue_count,accepted_at,accepted_name,accepted_document,customers(name,document),contracts(contract_number,description)")
          .eq("accept_token", params.token)
          .maybeSingle();
        if (error || !data) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
        return Response.json(data, { headers: CORS });
      },
      POST: async ({ params, request }) => {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const name = String(body.name ?? "").trim();
        const document = String(body.document ?? "").trim();
        if (name.length < 3 || document.length < 5) {
          return new Response(JSON.stringify({ error: "invalid_input" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
        }
        if (name.length > 200 || document.length > 40) {
          return new Response(JSON.stringify({ error: "input_too_long" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
        }
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const ua = request.headers.get("user-agent")?.slice(0, 500) ?? null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: current } = await supabaseAdmin
          .from("notifications_sent")
          .select("id,accepted_at")
          .eq("accept_token", params.token)
          .maybeSingle();
        if (!current) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
        if (current.accepted_at) return Response.json({ ok: true, already: true }, { headers: CORS });
        const { error } = await supabaseAdmin
          .from("notifications_sent")
          .update({ accepted_at: new Date().toISOString(), accepted_name: name, accepted_document: document, accepted_ip: ip, accepted_user_agent: ua })
          .eq("id", current.id);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});