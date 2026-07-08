import { sendReminderFn } from "./send-reminder.functions";

export interface ReminderInput {
  installmentId: string;
  customerName: string;
  customerEmail: string;
  contractDescription: string;
  installmentNumber: number;
  installmentsTotal: number;
  amount: number;
  dueDate: string;
}

export async function sendInstallmentReminder(input: ReminderInput) {
  return await sendReminderFn({ data: input });
}