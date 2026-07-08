export function brl(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return date.toLocaleDateString("pt-BR");
}

export function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export function installmentStatus(due: string, paidAt: string | null): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  overdue: boolean;
  daysLate: number;
} {
  if (paidAt) return { label: "Paga", variant: "secondary", overdue: false, daysLate: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const diff = daysBetween(today, d);
  if (diff > 0) return { label: `${diff}d em atraso`, variant: "destructive", overdue: true, daysLate: diff };
  if (diff === 0) return { label: "Vence hoje", variant: "default", overdue: false, daysLate: 0 };
  return { label: "Pendente", variant: "outline", overdue: false, daysLate: 0 };
}