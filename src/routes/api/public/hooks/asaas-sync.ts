import { createFileRoute } from "@tanstack/react-router";

const PAID_STATUSES = new Set([
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
  "ANTICIPATED",
]);
const REFUND_STATUSES = new Set([
  "REFUNDED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "DELETED",
]);

export const Route = createFileRoute("/api/public/hooks/asaas-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Segredo dedicado (nunca a chave publicável, que é pública no frontend).
        const provided =
          request.headers.get("x-hook-secret") ?? request.headers.get("X-Hook-Secret");
        const expected = process.env.CRON_HOOK_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const asaasKey = process.env.ASAAS_API_KEY;
        const asaasBase = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
        if (!asaasKey) {
          return new Response(JSON.stringify({ ok: false, error: "ASAAS_API_KEY não configurada" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Parcelas ainda em aberto que possuem cobrança Asaas
        const { data: pending, error } = await supabaseAdmin
          .from("installments")
          .select("id, amount, asaas_payment_id, status, paid_at")
          .not("asaas_payment_id", "is", null)
          .is("paid_at", null)
          .limit(500);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let checked = 0;
        let markedPaid = 0;
        let markedRefund = 0;
        const errors: string[] = [];

        for (const inst of pending || []) {
          checked++;
          try {
            const res = await fetch(`${asaasBase}/payments/${inst.asaas_payment_id}`, {
              headers: {
                access_token: asaasKey,
                "User-Agent": "MML-Cobranca/1.0",
              },
            });
            if (!res.ok) {
              if (res.status !== 404) errors.push(`#${inst.asaas_payment_id}: HTTP ${res.status}`);
              continue;
            }
            const p: any = await res.json();
            const status: string = p?.status || "";
            if (PAID_STATUSES.has(status)) {
              const paidRaw =
                p.paymentDate || p.clientPaymentDate || p.confirmedDate || new Date().toISOString().slice(0, 10);
              const iso = new Date(paidRaw + (paidRaw.length === 10 ? "T12:00:00" : "")).toISOString();
              const patch: { status: string; paid_at: string; amount?: number } = { status: "paga", paid_at: iso };
              if (typeof p.value === "number") patch.amount = p.value;
              await supabaseAdmin.from("installments").update(patch).eq("id", inst.id);
              markedPaid++;
            } else if (REFUND_STATUSES.has(status)) {
              await supabaseAdmin
                .from("installments")
                .update({ status: "pendente", paid_at: null })
                .eq("id", inst.id);
              markedRefund++;
            }
          } catch (e: any) {
            errors.push(`#${inst.asaas_payment_id}: ${e?.message ?? String(e)}`);
          }
        }

        return Response.json({
          ok: true,
          checked,
          markedPaid,
          markedRefund,
          errors: errors.slice(0, 20),
        });
      },
    },
  },
});