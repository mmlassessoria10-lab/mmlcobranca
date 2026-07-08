import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProcessResult {
  considered: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ id: string; status: "sent" | "skipped" | "error"; reason?: string }>;
}

// Sends reminders for installments that are overdue OR due in `daysBefore` days.
// Skips installments whose last_reminder_sent_at is within minIntervalHours.
export async function processReminders(
  supabase: SupabaseClient,
  opts: { daysBefore?: number; minIntervalHours?: number } = {},
): Promise<ProcessResult> {
  const daysBefore = opts.daysBefore ?? 3;
  const minIntervalHours = opts.minIntervalHours ?? 20;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const preview = new Date(today);
  preview.setDate(preview.getDate() + daysBefore);
  const previewIso = preview.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("installments")
    .select(
      "id, number, due_date, amount, paid_at, last_reminder_sent_at, reminder_count, contracts(description, installments_count, customers(name, email, phone))",
    )
    .is("paid_at", null)
    .or(`due_date.lt.${todayIso},due_date.eq.${previewIso}`);

  if (error) throw error;

  const result: ProcessResult = { considered: data?.length ?? 0, sent: 0, skipped: 0, errors: 0, details: [] };
  const cutoff = Date.now() - minIntervalHours * 3600 * 1000;

  for (const inst of data ?? []) {
    const last = inst.last_reminder_sent_at ? new Date(inst.last_reminder_sent_at).getTime() : 0;
    if (last > cutoff) {
      result.skipped++;
      result.details.push({ id: inst.id, status: "skipped", reason: "intervalo mínimo não atingido" });
      continue;
    }
    const customer = (inst as any).contracts?.customers;
    if (!customer?.email) {
      result.skipped++;
      result.details.push({ id: inst.id, status: "skipped", reason: "cliente sem e-mail" });
      continue;
    }
    const { error: upErr } = await supabase
      .from("installments")
      .update({
        last_reminder_sent_at: new Date().toISOString(),
        reminder_count: (inst.reminder_count ?? 0) + 1,
      })
      .eq("id", inst.id);
    if (upErr) {
      result.errors++;
      result.details.push({ id: inst.id, status: "error", reason: upErr.message });
      continue;
    }
    result.sent++;
    result.details.push({ id: inst.id, status: "sent" });
  }

  return result;
}