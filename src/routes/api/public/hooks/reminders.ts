import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("Apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
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