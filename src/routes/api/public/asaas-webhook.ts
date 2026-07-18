import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;
        const token = request.headers.get("asaas-access-token") || request.headers.get("Asaas-Access-Token");
        if (expected && token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let payload: any;
        try { payload = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
        const event: string = payload?.event || "";
        const payment = payload?.payment;
        if (!payment?.id) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const paidEvents = new Set([
          "PAYMENT_CONFIRMED",
          "PAYMENT_RECEIVED",
          "PAYMENT_RECEIVED_IN_CASH",
          "PAYMENT_CHARGEBACK_REVERSED",
          "PAYMENT_ANTICIPATED",
        ]);
        const refundEvents = new Set([
          "PAYMENT_REFUNDED",
          "PAYMENT_CHARGEBACK_REQUESTED",
          "PAYMENT_DELETED",
          "PAYMENT_REFUND_IN_PROGRESS",
        ]);

        if (paidEvents.has(event)) {
          const paidAt = payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString().slice(0, 10);
          const iso = new Date(paidAt + (paidAt.length === 10 ? "T12:00:00" : "")).toISOString();
          const patch: { status: string; paid_at: string; amount?: number } = { status: "paga", paid_at: iso };
          if (typeof payment.value === "number") patch.amount = payment.value;
          await supabaseAdmin.from("installments").update(patch).eq("asaas_payment_id", payment.id);
        } else if (refundEvents.has(event)) {
          await supabaseAdmin
            .from("installments")
            .update({ status: "pendente", paid_at: null })
            .eq("asaas_payment_id", payment.id);
        }
        return new Response("ok");
      },
    },
  },
});