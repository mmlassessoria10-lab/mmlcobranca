export const LEGAL_CONTACT = {
  name: "Paulo Cidade - Dpto. Jurídico",
  email: "mmlassessoria10@gmail.com",
  phone: "(65) 98136-0021",
};

const PUBLIC_APP_ORIGIN = "https://mmlcobranca.lovable.app";

function normalizeBrazilianPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const withoutDialPrefix = digits.startsWith("00") ? digits.slice(2) : digits;
  const withoutLeadingZero = withoutDialPrefix.startsWith("0") && !withoutDialPrefix.startsWith("55")
    ? withoutDialPrefix.slice(1)
    : withoutDialPrefix;
  return withoutLeadingZero.startsWith("55") ? withoutLeadingZero : `55${withoutLeadingZero}`;
}

function copyText(message: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(message).catch(() => undefined);
    return;
  }
  if (typeof document === "undefined") return;
  const area = document.createElement("textarea");
  area.value = message;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    // Clipboard fallback is best-effort only.
  } finally {
    area.remove();
  }
}

function withSignature(message: string) {
  return `${message.trim()}\n\nAtenciosamente,\n${LEGAL_CONTACT.name}\n${LEGAL_CONTACT.email}\n${LEGAL_CONTACT.phone}`;
}

export function openEmailComposer(email: string | null | undefined, subject: string, message: string) {
  const recipient = (email ?? "").trim();
  if (!recipient) return false;
  const url = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
  return true;
}

export function publicAcceptanceUrl(path: "n" | "a", token: string) {
  return `${PUBLIC_APP_ORIGIN}/${path}/${token}`;
}

export function buildLegalNoticeWhatsAppMessage(input: { customerName?: string; link: string }) {
  const greeting = input.customerName ? `Prezado(a) ${input.customerName},\n\n` : "";
  return withSignature(
    `⚠️ NOTIFICAÇÃO EXTRAJUDICIAL\n\n${greeting}` +
      "Trata-se de comunicação formal de cobrança. Aguardamos seu retorno com máxima prioridade para evitar a adoção das medidas judiciais cabíveis.\n\n" +
      `Acesse o documento na íntegra e realize o aceite digital:\n${input.link}`,
  );
}

export function buildAgreementWhatsAppMessage(input: { customerName?: string; link: string }) {
  const greeting = input.customerName ? `Prezado(a) ${input.customerName},\n\n` : "";
  return withSignature(
    `⚠️ ACORDO EXTRAJUDICIAL\n\n${greeting}` +
      "Encaminhamos proposta formal de regularização do débito. Aguardamos seu retorno com máxima prioridade para evitar a adoção das medidas judiciais cabíveis.\n\n" +
      `Acesse as condições do acordo e realize o aceite digital:\n${input.link}`,
  );
}

export function publicSalesUrl(token: string) {
  return `${PUBLIC_APP_ORIGIN}/v/${token}`;
}

export function buildSalesReceiptWhatsAppMessage(input: { customerName?: string; link: string }) {
  const greeting = input.customerName ? `Olá ${input.customerName},\n\n` : "Olá,\n\n";
  return withSignature(
    `🧾 RECIBO DE VENDA\n\n${greeting}` +
      "Segue o recibo com os itens, valores e o plano de parcelamento acordado. Para firmar o trato, acesse o link abaixo, confira as informações, envie uma selfie e realize a assinatura digital:\n\n" +
      `${input.link}`,
  );
}

export function buildInstallmentReminderWhatsAppMessage(input: {
  customerName?: string;
  contractDescription?: string;
  installmentLabel: string;
  amount: string;
  dueDate: string;
  daysLate?: number;
}) {
  const late = input.daysLate && input.daysLate > 0 ? ` (${input.daysLate} dia(s) em atraso)` : "";
  return withSignature(
    `Olá ${input.customerName || ""},\n\n` +
      "Identificamos uma parcela em aberto vinculada ao seu contrato.\n\n" +
      `Contrato: ${input.contractDescription || "—"}\n` +
      `Parcela: ${input.installmentLabel}\n` +
      `Valor: ${input.amount}\n` +
      `Vencimento: ${input.dueDate}${late}\n\n` +
      "Pedimos a regularização ou contato com nosso departamento jurídico.",
  );
}

export function openWhatsAppComposer(phone: string, message: string) {
  const normalizedPhone = normalizeBrazilianPhone(phone);
  if (!normalizedPhone) return false;

  copyText(message);

  if (typeof document === "undefined") return true;
  const link = document.createElement("a");
  link.href = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}