import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processReminders } from "./process.server";

export const processRemindersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as any });
    const { data: allowedFin } = await supabase.rpc("has_role", { _user_id: userId, _role: "financeiro" as any });
    const { data: allowedCob } = await supabase.rpc("has_role", { _user_id: userId, _role: "cobranca" as any });
    if (!allowed && !allowedFin && !allowedCob) {
      throw new Error("Sem permissão para enviar lembretes");
    }
    return await processReminders(supabase);
  });