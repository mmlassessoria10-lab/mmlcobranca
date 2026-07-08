import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  headers: z.array(z.string()),
  sampleRows: z.array(z.array(z.any())).max(5),
});

const TARGET_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "customer_name", label: "Nome do cliente", required: true },
  { key: "customer_document", label: "CPF/CNPJ do cliente" },
  { key: "customer_email", label: "E-mail do cliente" },
  { key: "customer_phone", label: "Telefone do cliente" },
  { key: "contract_description", label: "Descrição do contrato", required: true },
  { key: "total_amount", label: "Valor total do contrato", required: true },
  { key: "installments_count", label: "Número de parcelas", required: true },
  { key: "first_due_date", label: "Primeira data de vencimento (YYYY-MM-DD ou DD/MM/YYYY)", required: true },
];

export const aiMapColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const fieldList = TARGET_FIELDS.map((f) => `- ${f.key}: ${f.label}${f.required ? " (obrigatório)" : ""}`).join("\n");
    const sample = data.sampleRows.slice(0, 3).map((r) => r.join(" | ")).join("\n");

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você mapeia colunas de planilhas de cobrança/parcelamento para campos de um sistema. " +
            "Retorne SEMPRE JSON válido com a forma { mapping: { campo_destino: nome_coluna_origem | null } }. " +
            "Se não houver coluna equivalente, use null.",
        },
        {
          role: "user",
          content:
            `Campos do sistema:\n${fieldList}\n\n` +
            `Cabeçalhos da planilha:\n${data.headers.join(" | ")}\n\n` +
            `Amostra de linhas:\n${sample}\n\n` +
            "Devolva apenas o JSON.",
        },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Limite de requisições da IA. Tente novamente em alguns segundos.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos para usar a importação.");
      throw new Error(`Falha na IA (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let mapping: Record<string, string | null> = {};
    try {
      const parsed = JSON.parse(content);
      mapping = parsed.mapping ?? parsed;
    } catch {
      mapping = {};
    }
    return {
      mapping,
      targetFields: TARGET_FIELDS.map((f) => ({ key: f.key, label: f.label, required: !!f.required })),
    };
  });