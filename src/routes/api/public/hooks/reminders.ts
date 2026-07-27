import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/reminders")({
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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processReminders } = await import("@/lib/reminders/process.server");
        try {
          const result = await processReminders(supabaseAdmin);
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});