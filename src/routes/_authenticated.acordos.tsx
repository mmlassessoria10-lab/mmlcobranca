import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate, valorPorExtenso } from "@/lib/format";
import { Handshake, Plus, Printer, Save, Trash2, FileText, RefreshCw, Send, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { buildAgreementWhatsAppMessage, openEmailComposer, openWhatsAppComposer, publicAcceptanceUrl } from "@/lib/communication";
import headerAsset from "@/assets/mml-logo.jpeg.asset.json";

export const Route = createFileRoute("/_authenticated/acordos")({
  head: () => ({ meta: [{ title: "Acordos Extrajudiciais | Stillo Foto" }] }),
  component: AcordosPage,
});

const FINE_RATE = 0.02;
const DAILY_INTEREST = 0.00034;

function daysLate(due: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(due + "T00:00:00");
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86_400_000));
}
function computeOverdue(installments: any[]) {
  const items = (installments ?? [])
    .filter((i) => !i.paid_at)
    .map((i) => {
      const days = daysLate(i.due_date);
      if (days <= 0) return null;
      const amount = Number(i.amount);
      const fine = amount * FINE_RATE;
      const interest = amount * DAILY_INTEREST * days;
      return { ...i, days, amount, fine, interest, updated: amount + fine + interest };
    })
    .filter(Boolean) as any[];
  items.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return {
    items,
    original: items.reduce((a, i) => a + i.amount, 0),
    fine: items.reduce((a, i) => a + i.fine, 0),
    interest: items.reduce((a, i) => a + i.interest, 0),
    updated: items.reduce((a, i) => a + i.updated, 0),
  };
}
function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
}

function AcordosPage() {
  const qc = useQueryClient();
  const { user, isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro") || hasRole("cobranca");

  const [tplOpen, setTplOpen] = useState(false);
  const [tplEdit, setTplEdit] = useState<any | null>(null);
  const [tplForm, setTplForm] = useState({ name: "", subject: "", body: "", has_entry: false, default_installments: 6 });

  const [genOpen, setGenOpen] = useState(false);
  const [selCustomer, setSelCustomer] = useState("");
  const [selContract, setSelContract] = useState("");
  const [selTemplate, setSelTemplate] = useState("");
  const [entry, setEntry] = useState<string>("0");
  const [parcels, setParcels] = useState<string>("6");
  const [discount, setDiscount] = useState<string>("0");
  const [firstDue, setFirstDue] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0,10);
  });
  const [previewBody, setPreviewBody] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [lastSaved, setLastSaved] = useState<{ id: string; accept_token: string } | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["agreement-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("agreement_templates").select("*").order("name");
      if (error) throw error; return data ?? [];
    },
  });

  const { data: agreements } = useQuery({
    queryKey: ["agreements-list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("agreements")
        .select("*, customers(name,document,email,phone), contracts(contract_number,description), agreement_templates(name)")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error; return data ?? [];
    },
  });

  const { data: logoSetting } = useQuery({
    queryKey: ["setting", "agreement_logo"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "agreement_logo").maybeSingle();
      return data;
    },
  });

  const { data: companyInfo } = useQuery({
    queryKey: ["setting", "company_info"],
    queryFn: async () => (await supabase.from("app_settings").select("value").eq("key", "company_info").maybeSingle()).data?.value ?? {},
  });

  const { data: customers } = useQuery({
    queryKey: ["agr-customers"], enabled: genOpen,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("customers").select("id,name,document,email,phone").order("name").limit(1000);
      if (error) throw error; return data ?? [];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["agr-contracts", selCustomer], enabled: !!selCustomer,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contracts")
        .select("id,description,contract_number,installments(id,number,due_date,amount,paid_at)")
        .eq("customer_id", selCustomer).order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });

  const selectedCustomer = (customers ?? []).find((c: any) => c.id === selCustomer);
  const selectedContract = (contracts ?? []).find((c: any) => c.id === selContract);
  const selectedTemplate = (templates ?? []).find((t: any) => t.id === selTemplate);

  const overdue = useMemo(() => selectedContract ? computeOverdue(selectedContract.installments ?? []) : { items: [], original: 0, fine: 0, interest: 0, updated: 0 }, [selectedContract]);

  const parcelsN = Math.max(1, parseInt(parcels || "1"));
  const discountN = Math.max(0, Math.min(Number(discount || 0), overdue.updated));
  const updatedWithDiscount = Math.max(0, overdue.updated - discountN);
  const entryN = Math.max(0, Math.min(Number(entry || 0), updatedWithDiscount));
  const balance = Math.max(0, updatedWithDiscount - entryN);
  const installmentValue = balance > 0 ? Math.round((balance / parcelsN) * 100) / 100 : 0;
  const discountPct = overdue.updated > 0 ? (discountN / overdue.updated) * 100 : 0;

  function buildVars() {
    return {
      cliente_nome: selectedCustomer?.name ?? "",
      cliente_documento: selectedCustomer?.document ?? "",
      cliente_email: selectedCustomer?.email ?? "",
      cliente_telefone: selectedCustomer?.phone ?? "",
      contrato_numero: selectedContract?.contract_number ?? "—",
      contrato_descricao: selectedContract?.description ?? "",
      parcelas_atrasadas: String(overdue.items.length),
      valor_original: brl(overdue.original),
      multa: brl(overdue.fine),
      juros: brl(overdue.interest),
      valor_atualizado: brl(overdue.updated),
      desconto: brl(discountN),
      desconto_percentual: `${discountPct.toFixed(2).replace(".", ",")}%`,
      valor_com_desconto: brl(updatedWithDiscount),
      entrada: brl(entryN),
      saldo: brl(balance),
      qtd_parcelas: String(parcelsN),
      valor_parcela: brl(installmentValue),
      primeiro_vencimento: fmtDate(firstDue),
      total_acordo: brl(entryN + installmentValue * parcelsN),
      data_hoje: new Date().toLocaleDateString("pt-BR"),
    } as Record<string, string>;
  }

  function refreshPreview() {
    if (!selectedTemplate) return toast.error("Selecione um modelo");
    if (!selectedContract) return toast.error("Selecione um contrato");
    const vars = buildVars();
    setPreviewSubject(renderTemplate(selectedTemplate.subject ?? "", vars));
    setPreviewBody(renderTemplate(selectedTemplate.body ?? "", vars));
  }

  async function saveTemplate() {
    if (!tplForm.name.trim() || !tplForm.body.trim()) return toast.error("Nome e corpo são obrigatórios");
    const payload: any = { name: tplForm.name.trim(), subject: tplForm.subject, body: tplForm.body, has_entry: tplForm.has_entry, default_installments: Number(tplForm.default_installments) || 1 };
    if (tplEdit) {
      const { error } = await (supabase as any).from("agreement_templates").update(payload).eq("id", tplEdit.id);
      if (error) return toast.error(error.message);
    } else {
      payload.created_by = user?.id;
      const { error } = await (supabase as any).from("agreement_templates").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Modelo salvo");
    setTplOpen(false); setTplEdit(null); setTplForm({ name: "", subject: "", body: "", has_entry: false, default_installments: 6 });
    qc.invalidateQueries({ queryKey: ["agreement-templates"] });
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Excluir este modelo?")) return;
    const { error } = await (supabase as any).from("agreement_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["agreement-templates"] });
  }

  async function registerAgreement() {
    if (!selectedCustomer || !previewBody) return toast.error("Gere a prévia primeiro");
    const { data, error } = await (supabase as any).from("agreements").insert({
      customer_id: selectedCustomer.id,
      contract_id: selectedContract?.id ?? null,
      template_id: selectedTemplate?.id ?? null,
      subject: previewSubject, body: previewBody,
      original_amount: overdue.original, updated_amount: updatedWithDiscount,
      fine_amount: overdue.fine, interest_amount: overdue.interest,
      overdue_count: overdue.items.length,
      entry_amount: entryN, installments_count: parcelsN, installment_amount: installmentValue,
      first_due_date: firstDue, total_amount: entryN + installmentValue * parcelsN,
      sent_by: user?.id,
    }).select("id,accept_token").single();
    if (error) return toast.error(error.message);
    setLastSaved({ id: data.id, accept_token: data.accept_token });
    toast.success("Acordo registrado");
    qc.invalidateQueries({ queryKey: ["agreements-list"] });
  }

  async function printPreview() {
    if (!previewBody) return toast.error("Gere a prévia primeiro");
    let logoUrl = headerAsset.url;
    try {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "agreement_logo").maybeSingle();
      const u = (data?.value as any)?.url;
      if (u) logoUrl = u;
    } catch {}
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<html><head><title>${previewSubject || "Acordo"}</title>
      <style>body{font-family:Georgia,serif;padding:40px;line-height:1.6;color:#111;max-width:720px;margin:0 auto;}
      .logo{display:flex;justify-content:center;margin-bottom:24px;}
      .logo img{max-height:120px;width:auto;}
      h1{font-size:18px;text-transform:uppercase;text-align:center;margin-bottom:24px;}
      .body{white-space:pre-wrap;}</style>
      </head><body>
      <div class="logo"><img src="${logoUrl}" alt="Logo" /></div>
      <h1>${previewSubject || "Acordo"}</h1>
      <div class="body">${previewBody.replace(/</g,"&lt;")}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  function openTemplate(t: any) {
    setSelTemplate(t.id);
    setParcels(String(t.default_installments ?? 6));
    if (!t.has_entry) setEntry("0");
  }

  const agreementLogoUrl = (logoSetting?.value as any)?.url ?? headerAsset.url;

  async function printPromissoryNote(a: any) {
    let logoUrl = headerAsset.url;
    try {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "agreement_logo").maybeSingle();
      const u = (data?.value as any)?.url;
      if (u) logoUrl = u;
    } catch {}
    const co: any = companyInfo ?? {};
    const total = Number(a.total_amount || 0);
    const parcelas = Number(a.installments_count || 1);
    const parcela = Number(a.installment_amount || 0);
    const firstDue = a.first_due_date ? fmtDate(a.first_due_date) : "—";
    const emissao = new Date().toLocaleDateString("pt-BR");
    const credor = co.name || "—";
    const credorDoc = co.cnpj || co.document || "";
    const credorEnd = [co.address, co.city, co.state].filter(Boolean).join(", ");
    const devedor = a.customers?.name || a.accepted_name || "—";
    const devedorDoc = a.customers?.document || a.accepted_document || "—";
    const contrato = a.contracts?.contract_number ? `Nº ${a.contracts.contract_number}` : (a.contracts?.description ?? "—");
    const sig = a.promissory_signature;
    const selfie = a.promissory_selfie;
    const assinadoEm = a.promissory_accepted_at ? new Date(a.promissory_accepted_at).toLocaleString("pt-BR") : null;

    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<html><head><title>Nota Promissória - ${devedor}</title>
      <style>
        body{font-family:Georgia,serif;padding:32px;color:#111;max-width:780px;margin:0 auto;line-height:1.5;}
        .logo{display:flex;justify-content:center;margin-bottom:16px;} .logo img{max-height:90px;}
        h1{text-align:center;font-size:20px;letter-spacing:2px;margin:0 0 8px;}
        .meta{display:flex;justify-content:space-between;font-size:12px;color:#555;margin-bottom:24px;border-bottom:1px solid #ddd;padding-bottom:8px;}
        .box{border:2px solid #111;padding:20px;border-radius:6px;}
        .valor{font-size:22px;font-weight:bold;text-align:right;margin-bottom:12px;}
        p{margin:8px 0;text-align:justify;}
        .parcelas{background:#f8f8f8;padding:10px;border-radius:4px;font-size:13px;margin-top:12px;}
        .assinatura{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:32px;}
        .assinatura .linha{border-top:1px solid #111;padding-top:6px;text-align:center;font-size:12px;}
        .selfie{margin-top:24px;text-align:center;}
        .selfie img{max-height:180px;border:1px solid #ccc;padding:4px;}
        .sig-img{max-height:80px;}
        .digital{margin-top:24px;padding:12px;background:#f0f9ff;border-left:4px solid #0284c7;font-size:12px;}
        @media print{ .noprint{display:none;} }
      </style></head><body>
      <div class="logo"><img src="${logoUrl}" alt="Logo"/></div>
      <h1>NOTA PROMISSÓRIA</h1>
      <div class="meta">
        <span>Nº ${(a.id || "").toString().slice(0,8).toUpperCase()}</span>
        <span>Contrato: ${contrato}</span>
        <span>Emissão: ${emissao}</span>
      </div>
      <div class="box">
        <div class="valor">R$ ${total.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        <p>Aos <b>${firstDue}</b> e demais vencimentos subsequentes, pagarei(emos) por esta única via de <b>NOTA PROMISSÓRIA</b> a
        <b>${credor}</b>${credorDoc ? `, inscrita no CNPJ/CPF sob nº <b>${credorDoc}</b>` : ""}${credorEnd ? `, com endereço em ${credorEnd}` : ""},
        ou à sua ordem, a quantia de <b>R$ ${total.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</b>
        (<i>${valorPorExtenso(total)}</i>), em moeda corrente nacional, referente ao acordo extrajudicial firmado nesta data.</p>

        <p><b>Emitente/Devedor:</b> ${devedor}, portador do documento <b>${devedorDoc}</b>.</p>

        <div class="parcelas">
          <b>Parcelamento:</b> ${parcelas}× de R$ ${parcela.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}
          &nbsp;·&nbsp; <b>Primeiro vencimento:</b> ${firstDue}
          ${Number(a.entry_amount||0) > 0 ? `&nbsp;·&nbsp; <b>Entrada:</b> R$ ${Number(a.entry_amount).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}` : ""}
        </div>

        <p style="margin-top:16px;">Em caso de inadimplemento, incidirão multa de 2% (dois por cento), juros de mora de 1% ao mês e correção monetária,
        além das despesas de cobrança judicial ou extrajudicial, sem prejuízo do vencimento antecipado das demais parcelas.</p>

        ${assinadoEm ? `
        <div class="digital">
          <b>✓ Assinatura digital confirmada em ${assinadoEm}</b><br/>
          Nome: ${a.promissory_name || devedor}<br/>
          Documento: ${a.promissory_document || devedorDoc}<br/>
          ${a.promissory_ip ? `IP: ${a.promissory_ip}<br/>` : ""}
          ${a.promissory_user_agent ? `Dispositivo: ${a.promissory_user_agent}` : ""}
        </div>` : ""}

        <div class="assinatura">
          <div>
            ${sig ? `<img class="sig-img" src="${sig}" alt="Assinatura"/>` : ""}
            <div class="linha">${devedor}<br/>Emitente / Devedor</div>
          </div>
          <div>
            <div class="linha">${credor}<br/>Credor / Beneficiário</div>
          </div>
        </div>

        ${selfie ? `<div class="selfie"><p><b>Selfie de confirmação:</b></p><img src="${selfie}" alt="Selfie"/></div>` : ""}
      </div>
      <div class="noprint" style="text-align:center;margin-top:24px;">
        <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">Imprimir</button>
      </div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 700);
  }

  function sendAgreementWhatsApp(customer: any, token?: string | null) {
    if (!token) return toast.error("Registre o acordo antes para gerar o link de aceite");
    const link = publicAcceptanceUrl("a", token);
    const txt = buildAgreementWhatsAppMessage({ customerName: customer?.name, link });
    if (!openWhatsAppComposer(customer?.phone ?? "", txt)) return toast.error("Cliente sem telefone cadastrado");
    toast.success("WhatsApp aberto e mensagem copiada.");
  }

  function sendAgreementEmail(customer: any, subject: string, token?: string | null) {
    if (!token) return toast.error("Registre o acordo antes para gerar o link de aceite");
    const link = publicAcceptanceUrl("a", token);
    const body = buildAgreementWhatsAppMessage({ customerName: customer?.name, link });
    if (!openEmailComposer(customer?.email, subject || "Acordo Extrajudicial", body)) return toast.error("Cliente sem e-mail cadastrado");
    toast.success("E-mail aberto. Confirme o envio no seu aplicativo de e-mail.");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Handshake className="w-7 h-7" /> Acordos Extrajudiciais</h1>
          <p className="text-muted-foreground mt-1">Modelos com ou sem entrada, cálculo automático de multa/juros, envio por WhatsApp e aceite por assinatura digital.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setTplEdit(null); setTplForm({ name: "", subject: "", body: "", has_entry: false, default_installments: 6 }); setTplOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Novo modelo
            </Button>
            <Button onClick={() => { setGenOpen(true); setPreviewBody(""); setPreviewSubject(""); setLastSaved(null); }}>
              <Send className="w-4 h-4 mr-2" /> Gerar acordo
            </Button>
          </div>
        )}
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Modelos de acordo</CardTitle></CardHeader>
        <CardContent>
          {!templates?.length ? <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p> : (
            <div className="grid gap-2">
              {templates.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <p className="font-medium flex items-center gap-2">{t.name} <Badge variant={t.has_entry ? "default" : "secondary"}>{t.has_entry ? "com entrada" : "sem entrada"}</Badge> <Badge variant="outline">{t.default_installments}x</Badge></p>
                    <p className="text-xs text-muted-foreground">{t.subject || "sem assunto"}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setTplEdit(t); setTplForm({ name: t.name, subject: t.subject ?? "", body: t.body, has_entry: t.has_entry, default_installments: t.default_installments }); setTplOpen(true); }}>Editar</Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteTemplate(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Variáveis: <code>{"{{cliente_nome}}"}</code> <code>{"{{cliente_documento}}"}</code> <code>{"{{contrato_numero}}"}</code> <code>{"{{contrato_descricao}}"}</code> <code>{"{{parcelas_atrasadas}}"}</code> <code>{"{{valor_original}}"}</code> <code>{"{{multa}}"}</code> <code>{"{{juros}}"}</code> <code>{"{{valor_atualizado}}"}</code> <code>{"{{entrada}}"}</code> <code>{"{{saldo}}"}</code> <code>{"{{qtd_parcelas}}"}</code> <code>{"{{valor_parcela}}"}</code> <code>{"{{primeiro_vencimento}}"}</code> <code>{"{{total_acordo}}"}</code> <code>{"{{data_hoje}}"}</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Acordos gerados</CardTitle></CardHeader>
        <CardContent>
          {!agreements?.length ? <p className="text-sm text-muted-foreground">Nenhum acordo registrado.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Contrato</TableHead><TableHead>Modelo</TableHead>
                <TableHead>Entrada</TableHead><TableHead>Parcelas</TableHead><TableHead>Total</TableHead><TableHead>Aceite</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {agreements.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{fmtDate(a.created_at)}</TableCell>
                    <TableCell className="font-medium">{a.customers?.name}</TableCell>
                    <TableCell className="text-muted-foreground">{a.contracts?.contract_number ? `Nº ${a.contracts.contract_number}` : a.contracts?.description ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{a.agreement_templates?.name ?? "—"}</Badge></TableCell>
                    <TableCell>{brl(a.entry_amount)}</TableCell>
                    <TableCell>{a.installments_count}× {brl(a.installment_amount)}</TableCell>
                    <TableCell className="font-medium">{brl(a.total_amount)}</TableCell>
                    <TableCell>
                      {a.accepted_at ? (
                        <div className="space-y-1 text-xs">
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Aceito {new Date(a.accepted_at).toLocaleString("pt-BR")}</Badge>
                          {a.accepted_name && (
                            <p className="font-medium text-foreground">✍️ {a.accepted_name}</p>
                          )}
                          {a.accepted_document && (
                            <p className="text-muted-foreground">Doc: {a.accepted_document}</p>
                          )}
                          {a.accepted_ip && (
                            <p className="text-muted-foreground">IP: {a.accepted_ip}</p>
                          )}
                          {a.accepted_user_agent && (
                            <p className="text-muted-foreground truncate max-w-[240px]" title={a.accepted_user_agent}>UA: {a.accepted_user_agent}</p>
                          )}
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => { const u = `${window.location.origin}/a/${a.accept_token}`; navigator.clipboard.writeText(u); toast.success("Link copiado"); }}>Copiar link</Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {!a.accepted_at && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => sendAgreementWhatsApp(a.customers, a.accept_token)}>
                              <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => sendAgreementEmail(a.customers, a.subject, a.accept_token)}>
                              <Mail className="w-4 h-4 mr-1" /> E-mail
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="outline" onClick={() => printPromissoryNote(a)}>
                          <Printer className="w-4 h-4 mr-1" /> Nota Promissória
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Template editor */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tplEdit ? "Editar modelo" : "Novo modelo de acordo"}</DialogTitle>
            <DialogDescription>Use as variáveis entre chaves duplas. Marque "com entrada" se o modelo prevê pagamento inicial.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2"><Label>Nome</Label><Input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} /></div>
              <div><Label>Parcelas padrão</Label><Input type="number" min={1} value={tplForm.default_installments} onChange={(e) => setTplForm({ ...tplForm, default_installments: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Assunto</Label><Input value={tplForm.subject} onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={tplForm.has_entry} onCheckedChange={(v) => setTplForm({ ...tplForm, has_entry: v })} /><Label>Modelo com entrada</Label></div>
            <div><Label>Corpo</Label><Textarea rows={14} value={tplForm.body} onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplOpen(false)}>Cancelar</Button>
            <Button onClick={saveTemplate}><Save className="w-4 h-4 mr-2" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generator */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Gerar acordo extrajudicial</DialogTitle>
            <DialogDescription>Selecione cliente, contrato e modelo. Ajuste entrada e parcelas — os valores são recalculados automaticamente.</DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Cliente</Label>
              <Select value={selCustomer} onValueChange={(v) => { setSelCustomer(v); setSelContract(""); setPreviewBody(""); setLastSaved(null); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>{(customers ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contrato</Label>
              <Select value={selContract} onValueChange={(v) => { setSelContract(v); setPreviewBody(""); setLastSaved(null); }} disabled={!selCustomer}>
                <SelectTrigger><SelectValue placeholder={selCustomer ? "Selecionar..." : "Escolha o cliente"} /></SelectTrigger>
                <SelectContent>{(contracts ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.contract_number ? `Nº ${c.contract_number} · ` : ""}{c.description}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo</Label>
              <Select value={selTemplate} onValueChange={(v) => { const t = (templates ?? []).find((x: any) => x.id === v); if (t) openTemplate(t); else setSelTemplate(v); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>{(templates ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.has_entry ? "com entrada" : "sem entrada"})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {selectedContract && (
            <Card className="mt-3">
              <CardHeader><CardTitle className="text-sm">Simulação do acordo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Parcelas vencidas</p><p className="text-lg font-semibold">{overdue.items.length}</p></div>
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Original</p><p className="text-lg font-semibold">{brl(overdue.original)}</p></div>
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Multa + juros</p><p className="text-lg font-semibold">{brl(overdue.fine + overdue.interest)}</p></div>
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Débito atualizado</p><p className="text-lg font-semibold text-amber-600">{brl(overdue.updated)}</p></div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div><Label>Entrada (R$)</Label><Input type="number" min={0} step="0.01" value={entry} onChange={(e) => { setEntry(e.target.value); setLastSaved(null); }} disabled={!selectedTemplate?.has_entry} /></div>
                  <div><Label>Nº de parcelas</Label><Input type="number" min={1} value={parcels} onChange={(e) => { setParcels(e.target.value); setLastSaved(null); }} /></div>
                  <div><Label>1º vencimento</Label><Input type="date" value={firstDue} onChange={(e) => { setFirstDue(e.target.value); setLastSaved(null); }} /></div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label>Desconto (R$)</Label>
                    <Input type="number" min={0} step="0.01" value={discount} onChange={(e) => { setDiscount(e.target.value); setLastSaved(null); }} />
                  </div>
                  <div className="md:col-span-2 flex items-end gap-2 flex-wrap">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setDiscount(String(Math.max(0, overdue.updated - Math.floor(overdue.updated / 100) * 100).toFixed(2))); setLastSaved(null); }}>Arredondar p/ centena</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setDiscount(String((overdue.updated - Math.floor(overdue.updated / 1000) * 1000).toFixed(2))); setLastSaved(null); }}>Arredondar p/ milhar</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setDiscount(String((overdue.updated * 0.05).toFixed(2))); setLastSaved(null); }}>5%</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setDiscount(String((overdue.updated * 0.1).toFixed(2))); setLastSaved(null); }}>10%</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setDiscount("0"); setLastSaved(null); }}>Zerar</Button>
                  </div>
                </div>
                <div className="rounded border p-2 bg-muted/30 text-sm">
                  Débito atualizado <b>{brl(overdue.updated)}</b>
                  {discountN > 0 && <> − Desconto <b className="text-emerald-600">{brl(discountN)} ({discountPct.toFixed(2).replace(".", ",")}%)</b> = <b>{brl(updatedWithDiscount)}</b></>}
                  <br />
                  Entrada <b>{brl(entryN)}</b> + <b>{parcelsN}×</b> de <b>{brl(installmentValue)}</b> · Total <b>{brl(entryN + installmentValue * parcelsN)}</b>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2 mt-3 flex-wrap">
            <Button variant="outline" onClick={refreshPreview}><RefreshCw className="w-4 h-4 mr-2" /> Atualizar prévia</Button>
            <Button variant="outline" onClick={printPreview} disabled={!previewBody}><Printer className="w-4 h-4 mr-2" /> Imprimir / PDF</Button>
              <Button variant="outline" disabled={!previewBody} onClick={() => sendAgreementWhatsApp(selectedCustomer, lastSaved?.accept_token)}>
              <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
            </Button>
              <Button variant="outline" disabled={!previewBody} onClick={() => sendAgreementEmail(selectedCustomer, previewSubject, lastSaved?.accept_token)}>
                <Mail className="w-4 h-4 mr-2" /> E-mail
              </Button>
            <Button onClick={registerAgreement} disabled={!previewBody}><Send className="w-4 h-4 mr-2" /> Registrar acordo</Button>
          </div>

          {previewBody && (
            <div className="mt-3">
              <div className="mb-4 flex justify-center rounded border bg-muted/20 p-4">
                <img src={agreementLogoUrl} alt="Logo do termo extrajudicial" className="max-h-28 w-auto" />
              </div>
              <Label>Assunto</Label>
              <Input value={previewSubject} onChange={(e) => setPreviewSubject(e.target.value)} />
              <Label className="mt-2">Prévia (editável)</Label>
              <Textarea rows={16} value={previewBody} onChange={(e) => setPreviewBody(e.target.value)} className="font-mono text-xs" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}