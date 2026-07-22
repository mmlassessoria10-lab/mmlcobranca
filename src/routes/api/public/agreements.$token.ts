import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/agreements/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("agreements")
          .select("id,subject,body,created_at,original_amount,updated_amount,fine_amount,interest_amount,overdue_count,entry_amount,installments_count,installment_amount,first_due_date,total_amount,accepted_at,accepted_name,accepted_document,promissory_accepted_at,promissory_name,promissory_document,customers(name,document),contracts(contract_number,description)")
          .eq("accept_token", params.token)
          .maybeSingle();
        if (error || !data) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
        return Response.json(data, { headers: CORS });
      },
      POST: async ({ params, request }) => {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const kind = String(body.kind ?? "agreement");
        const name = String(body.name ?? "").trim();
        const document = String(body.document ?? "").trim();
        if (name.length < 3 || document.length < 5 || name.length > 200 || document.length > 40) {
          return new Response(JSON.stringify({ error: "invalid_input" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
        }
        const signature = typeof body.signature === "string" && body.signature.startsWith("data:image/") ? body.signature.slice(0, 2_000_000) : null;
        const selfie = typeof body.selfie === "string" && body.selfie.startsWith("data:image/") ? body.selfie.slice(0, 2_000_000) : null;
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const ua = request.headers.get("user-agent")?.slice(0, 500) ?? null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: current } = await supabaseAdmin.from("agreements").select("id,accepted_at,promissory_accepted_at").eq("accept_token", params.token).maybeSingle();
        if (!current) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

        let update: Record<string, any> = {};
        if (kind === "promissory") {
          if (current.promissory_accepted_at) return Response.json({ ok: true, already: true }, { headers: CORS });
          if (!signature) return new Response(JSON.stringify({ error: "signature_required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
          if (!selfie) return new Response(JSON.stringify({ error: "selfie_required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
          update = {
            promissory_accepted_at: new Date().toISOString(),
            promissory_name: name,
            promissory_document: document,
            promissory_signature: signature,
            promissory_selfie: selfie,
            promissory_ip: ip,
            promissory_user_agent: ua,
          };
        } else {
          if (current.accepted_at) return Response.json({ ok: true, already: true }, { headers: CORS });
          update = {
            accepted_at: new Date().toISOString(),
            accepted_name: name,
            accepted_document: document,
            accepted_ip: ip,
            accepted_user_agent: ua,
          };
          if (signature) update.accepted_signature = signature;
          if (selfie) update.accepted_selfie = selfie;
        }
        const { error } = await (supabaseAdmin.from("agreements") as any).update(update).eq("id", current.id);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});