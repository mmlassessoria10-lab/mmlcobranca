export const PIX_KEY = "+5565992479161";
export const PIX_KEY_LABEL = "Celular";
export const PIX_MERCHANT_NAME = "PHOTOGENIC IMAGE";
export const PIX_MERCHANT_CITY = "CUIABA";

export async function copyPix(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(PIX_KEY);
    return true;
  } catch {
    return false;
  }
}

// Monta o "BR Code" (EMV) do PIX estático com valor pré-preenchido.
// Referência: Manual do BR Code do Banco Central.
function tlv(id: string, value: string) {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(s: string, max: number) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, max);
}

export function buildPixPayload(opts: { amount?: number; txid?: string } = {}): string {
  const gui = tlv("00", "BR.GOV.BCB.PIX");
  const key = tlv("01", PIX_KEY);
  const merchantAccount = tlv("26", gui + key);

  const name = sanitize(PIX_MERCHANT_NAME, 25);
  const city = sanitize(PIX_MERCHANT_CITY, 15);
  const txid = sanitize(opts.txid ?? "***", 25) || "***";
  const additional = tlv("62", tlv("05", txid));

  const parts = [
    tlv("00", "01"),
    tlv("26", gui + key).slice(0, 0) + merchantAccount, // keep single 26 field
    tlv("52", "0000"),
    tlv("53", "986"),
  ];

  if (opts.amount && opts.amount > 0) {
    parts.push(tlv("54", opts.amount.toFixed(2)));
  }

  parts.push(tlv("58", "BR"));
  parts.push(tlv("59", name));
  parts.push(tlv("60", city));
  parts.push(additional);

  const partial = parts.join("") + "6304";
  return partial + crc16(partial);
}