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

// ---------- Valor por extenso (pt-BR) ----------
const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ateNoventaENove(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DEZ_A_DEZENOVE[n - 10];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DEZENAS[d] : `${DEZENAS[d]} e ${UNIDADES[u]}`;
}

function ateNovecentosENoventaENove(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c === 0) return ateNoventaENove(resto);
  if (resto === 0) return CENTENAS[c];
  return `${CENTENAS[c]} e ${ateNoventaENove(resto)}`;
}

function grupoExtenso(n: number, singular: string, plural: string): string {
  if (n === 0) return "";
  if (n === 1) return `um ${singular}`;
  return `${ateNovecentosENoventaENove(n)} ${plural}`;
}

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (milhoes > 0) partes.push(grupoExtenso(milhoes, "milhão", "milhões"));
  if (milhares > 0) {
    partes.push(milhares === 1 ? "mil" : `${ateNovecentosENoventaENove(milhares)} mil`);
  }
  if (resto > 0) partes.push(ateNovecentosENoventaENove(resto));
  // conector "e" entre grupos quando resto < 100 ou é múltiplo de 100
  return partes.join(" e ");
}

export function valorPorExtenso(value: number | string | null | undefined): string {
  const v = typeof value === "string" ? parseFloat(value) : value ?? 0;
  const num = Math.max(0, Math.round((v || 0) * 100) / 100);
  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);
  const parts: string[] = [];
  if (reais > 0) {
    parts.push(`${inteiroExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) {
    parts.push(`${inteiroExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  }
  if (parts.length === 0) return "zero real";
  return parts.join(" e ");
}