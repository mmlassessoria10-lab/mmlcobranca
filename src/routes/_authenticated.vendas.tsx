import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Copy, MessageCircle, Eye, Ban, Send, ShoppingBag } from "lucide-react";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate, maskDocument, maskPhone, maskCep, unmask, valorPorExtenso } from "@/lib/format";
import { upsertSalesReceipt, markSaleSent, cancelSale, getSaleSignedFiles } from "@/lib/sales/sales.functions";
import { openWhatsAppComposer, buildSalesReceiptWhatsAppMessage, publicSalesUrl } from "@/lib/communication";

function printFilledReceipt(
  sale: any,
  files: { selfie_url: string | null; signature_url: string | null } | null,
  company: any = {},
  contractNumber: string | null = null,
) {
  const snap = sale.customer_snapshot || {};
  const items: any[] = sale.items || [];
  const linha1 = [snap.street, snap.number && `nº ${snap.number}`, snap.quadra && `Qd. ${snap.quadra}`, snap.complement].filter(Boolean).join(", ");
  const linha2 = [snap.neighborhood, [snap.city, snap.state].filter(Boolean).join("/"), snap.cep && `CEP ${snap.cep}`].filter(Boolean).join(" · ");
  const rows = items.map((it) => `
    <tr>
      <td>${escapeHtml(it.description || "")}</td>
      <td style="text-align:center">${Number(it.quantity || 0)}</td>
      <td style="text-align:right">${brl(Number(it.unit_price || 0))}</td>
      <td style="text-align:right">${brl(Number(it.quantity || 0) * Number(it.unit_price || 0))}</td>
    </tr>`).join("");
  const acceptedBlock = sale.accepted_at ? `
    <div class="accept">
      <h3>Aceite digital</h3>
      <p><b>Assinado por:</b> ${escapeHtml(sale.accepted_name || "")} (${escapeHtml(sale.accepted_document || "")})</p>
      <p><b>Data:</b> ${new Date(sale.accepted_at).toLocaleString("pt-BR")} · <b>IP:</b> ${escapeHtml(sale.accepted_ip || "—")}</p>
      <div class="sig-grid">
        <div><p class="lbl">Selfie</p>${files?.selfie_url ? `<img src="${files.selfie_url}" />` : `<p class="muted">Não disponível</p>`}</div>
        <div><p class="lbl">Assinatura</p>${files?.signature_url ? `<img src="${files.signature_url}" style="background:#fff" />` : `<p class="muted">Não disponível</p>`}</div>
      </div>
    </div>` : `<p class="muted"><i>Recibo ainda não firmado pelo cliente.</i></p>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
  <title>Recibo ${escapeHtml(sale.receipt_number || sale.id.slice(0,8))}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color:#111; margin:24px; font-size:12px; }
    h1 { font-size:18px; margin:0 0 4px; }
    h3 { font-size:13px; margin:16px 0 6px; border-bottom:1px solid #ddd; padding-bottom:2px; }
    p { margin:2px 0; }
    .muted { color:#666; }
    table { width:100%; border-collapse:collapse; margin-top:6px; }
    th, td { border:1px solid #ccc; padding:6px; font-size:12px; }
    th { background:#f3f4f6; text-align:left; }
    .totals { margin-top:8px; width:60%; margin-left:auto; }
    .totals td { border:none; padding:2px 6px; }
    .totals td:last-child { text-align:right; font-weight:600; }
    .accept { margin-top:18px; border:1px solid #10b981; background:#ecfdf5; padding:10px; border-radius:6px; }
    .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }
    .sig-grid img { max-width:100%; max-height:200px; border:1px solid #ccc; border-radius:4px; }
    .lbl { font-size:11px; color:#555; margin-bottom:4px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:12px; }
    @media print { .no-print{display:none} body{margin:12mm} }
  </style></head><body>
  <div class="header">
    <div style="display:flex; gap:12px; align-items:flex-start">
      ${company?.logo_url ? `<img src="${escapeHtml(company.logo_url)}" alt="" style="height:64px;width:auto;object-fit:contain" />` : ""}
      <div>
        ${company?.name ? `<p style="font-size:14px;font-weight:700;margin:0">${escapeHtml(company.name)}</p>` : ""}
        ${company?.document ? `<p class="muted">CNPJ/CPF: ${escapeHtml(company.document)}</p>` : ""}
        ${company?.address ? `<p class="muted">${escapeHtml(company.address)}</p>` : ""}
        ${(company?.phone || company?.email) ? `<p class="muted">${escapeHtml([company.phone, company.email].filter(Boolean).join(" · "))}</p>` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <h1>Recibo de Venda${sale.receipt_number ? ` Nº ${escapeHtml(sale.receipt_number)}` : ""}</h1>
      ${contractNumber ? `<p><b>Contrato:</b> ${escapeHtml(contractNumber)}</p>` : ""}
      <p class="muted">Emitido em ${new Date(sale.created_at).toLocaleString("pt-BR")}</p>
      <p><b>Status:</b> ${escapeHtml(sale.status)}</p>
    </div>
  </div>

  <h3>Cliente</h3>
  <p><b>${escapeHtml(snap.name || "")}</b>${snap.document ? ` · Doc: ${escapeHtml(snap.document)}` : ""}</p>
  ${snap.email ? `<p>Email: ${escapeHtml(snap.email)}</p>` : ""}
  ${snap.phone ? `<p>Telefone: ${escapeHtml(snap.phone)}</p>` : ""}
  ${linha1 ? `<p>Endereço: ${escapeHtml(linha1)}</p>` : ""}
  ${linha2 ? `<p>${escapeHtml(linha2)}</p>` : ""}

  <h3>Itens</h3>
  <table>
    <thead><tr><th>Descrição</th><th style="width:60px">Qtd</th><th style="width:110px">Valor unit.</th><th style="width:110px">Subtotal</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal:</td><td>${brl(sale.items_total)}</td></tr>
    <tr><td>Desconto:</td><td>${brl(sale.discount)}</td></tr>
    <tr><td>Entrada:</td><td>${brl(sale.entry_amount)}</td></tr>
    <tr><td><b>Total:</b></td><td>${brl(sale.total_amount)}</td></tr>
    <tr><td>Parcelamento:</td><td>${sale.installments_count}× ${brl(sale.installment_amount)}</td></tr>
    <tr><td>1º vencimento:</td><td>${fmtDate(sale.first_due_date)}</td></tr>
  </table>

  ${sale.notes ? `<h3>Observações</h3><p>${escapeHtml(sale.notes).replace(/\n/g,"<br/>")}</p>` : ""}

  ${acceptedBlock}

  <p style="margin-top:24px" class="no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button></p>
  <script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),400)});</script>
  </body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function printSalesPromissoryNote(
  sale: any,
  files: { selfie_url: string | null; signature_url: string | null } | null,
  company: any = {},
  contractNumber: string | null = null,
) {
  const snap = sale.customer_snapshot || {};
  const total = Number(sale.total_amount || 0);
  const entry = Number(sale.entry_amount || 0);
  const noteValue = Math.max(0, total - entry) || total;
  const parcelas = Number(sale.installments_count || 1);
  const parcela = Number(sale.installment_amount || 0);
  const firstDue = sale.first_due_date ? fmtDate(sale.first_due_date) : "—";
  const emissao = sale.accepted_at ? fmtDate(sale.accepted_at) : fmtDate(sale.created_at);
  const credor = company?.name || "Credor";
  const credorDoc = company?.cnpj || company?.document || "";
  const credorEnd = [company?.address, company?.city, company?.state].filter(Boolean).join(", ");
  const devedor = sale.accepted_name || snap.name || "Devedor";
  const devedorDoc = sale.accepted_document || snap.document || "—";
  const contrato = contractNumber || sale.receipt_number || sale.id?.slice?.(0, 8) || "—";
  const acceptedAt = sale.accepted_at ? new Date(sale.accepted_at).toLocaleString("pt-BR") : null;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
    <title>Nota Promissória ${escapeHtml(contrato)}</title>
    <style>
      * { box-sizing: border-box; }
      body{font-family:Georgia,serif;padding:32px;color:#111;max-width:820px;margin:0 auto;line-height:1.5;}
      .logo{display:flex;justify-content:center;margin-bottom:16px;} .logo img{max-height:86px;max-width:260px;object-fit:contain;}
      h1{text-align:center;font-size:20px;letter-spacing:2px;margin:0 0 8px;text-transform:uppercase;}
      .meta{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#555;margin-bottom:24px;border-bottom:1px solid #ddd;padding-bottom:8px;}
      .box{border:2px solid #111;padding:20px;border-radius:6px;}
      .valor{font-size:22px;font-weight:bold;text-align:right;margin-bottom:12px;}
      p{margin:8px 0;text-align:justify;}
      .parcelas{background:#f8f8f8;padding:10px;border-radius:4px;font-size:13px;margin-top:12px;}
      .assinatura{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:end;}
      .assinatura .linha{border-top:1px solid #111;padding-top:6px;text-align:center;font-size:12px;min-height:42px;}
      .sig-img{max-height:82px;max-width:100%;object-fit:contain;display:block;margin:0 auto 6px;background:#fff;}
      .selfie{margin-top:24px;text-align:center;}
      .selfie img{max-height:180px;border:1px solid #ccc;padding:4px;}
      .digital{margin-top:24px;padding:12px;background:#f0f9ff;border-left:4px solid #0284c7;font-size:12px;}
      .muted{color:#666;}
      @media print{ .noprint{display:none;} body{padding:14mm;} }
    </style></head><body>
    ${company?.logo_url ? `<div class="logo"><img src="${escapeHtml(company.logo_url)}" alt="Logo"/></div>` : ""}
    <h1>Nota Promissória</h1>
    <div class="meta">
      <span>Nº ${escapeHtml((sale.receipt_number || sale.id?.slice?.(0, 8) || "").toString().toUpperCase())}</span>
      <span>Contrato/Recibo: ${escapeHtml(contrato)}</span>
      <span>Emissão: ${escapeHtml(emissao)}</span>
    </div>
    <div class="box">
      <div class="valor">${brl(noteValue)}</div>
      <p>Pelo presente título, o(a) emitente/devedor(a) <b>${escapeHtml(devedor)}</b>, portador(a) do documento <b>${escapeHtml(devedorDoc)}</b>, promete pagar a <b>${escapeHtml(credor)}</b>${credorDoc ? `, inscrita no CNPJ/CPF sob nº <b>${escapeHtml(credorDoc)}</b>` : ""}${credorEnd ? `, com endereço em ${escapeHtml(credorEnd)}` : ""}, ou à sua ordem, a quantia de <b>${brl(noteValue)}</b> (<i>${escapeHtml(valorPorExtenso(noteValue))}</i>), em moeda corrente nacional.</p>

      <p>Esta nota promissória está vinculada ao recibo de venda/acordo de parcelamento informado acima, reconhecido pelo(a) devedor(a) por assinatura digital e selfie de confirmação.</p>

      <div class="parcelas">
        <b>Parcelamento:</b> ${parcelas}× de ${brl(parcela)}
        &nbsp;·&nbsp; <b>Primeiro vencimento:</b> ${escapeHtml(firstDue)}
        ${entry > 0 ? `&nbsp;·&nbsp; <b>Entrada:</b> ${brl(entry)}` : ""}
        &nbsp;·&nbsp; <b>Total da venda:</b> ${brl(total)}
      </div>

      <p style="margin-top:16px;">Em caso de inadimplemento, incidirão multa de 2% (dois por cento), juros de mora de 1% ao mês e correção monetária, além das despesas de cobrança judicial ou extrajudicial, sem prejuízo do vencimento antecipado das demais parcelas.</p>

      ${acceptedAt ? `
      <div class="digital">
        <b>✓ Aceite digital confirmado em ${escapeHtml(acceptedAt)}</b><br/>
        Nome: ${escapeHtml(sale.accepted_name || devedor)}<br/>
        Documento: ${escapeHtml(sale.accepted_document || devedorDoc)}<br/>
        ${sale.accepted_ip ? `IP: ${escapeHtml(sale.accepted_ip)}<br/>` : ""}
        ${sale.accepted_user_agent ? `Dispositivo: ${escapeHtml(sale.accepted_user_agent)}` : ""}
      </div>` : `<p class="muted"><i>Nota ainda aguardando aceite digital do cliente.</i></p>`}

      <div class="assinatura">
        <div>
          ${files?.signature_url ? `<img class="sig-img" src="${files.signature_url}" alt="Assinatura digital"/>` : ""}
          <div class="linha">${escapeHtml(devedor)}<br/>Emitente / Devedor</div>
        </div>
        <div>
          <div class="linha">${escapeHtml(credor)}<br/>Credor / Beneficiário</div>
        </div>
      </div>

      ${files?.selfie_url ? `<div class="selfie"><p><b>Selfie de confirmação:</b></p><img src="${files.selfie_url}" alt="Selfie"/></div>` : ""}
    </div>
    <div class="noprint" style="text-align:center;margin-top:24px;">
      <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">Imprimir / Salvar PDF</button>
    </div>
    <script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),500)});</script>
    </body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
}

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas | Departamento de Vendas" }] }),
  component: VendasPage,
});

type Item = { description: string; quantity: number; unit_price: number };

const emptyForm = () => ({
  id: null as string | null,
  customer_id: "" as string,
  customer_new: false,
  snap: {
    name: "",
    document: "",
    email: "",
    phone: "",
    cep: "",
    street: "",
    number: "",
    quadra: "",
    neighborhood: "",
    city: "",
    state: "",
    complement: "",
    address: "",
  },
  vendor_id: "none",
  receipt_number: "",
  items: [{ description: "", quantity: 1, unit_price: 0 }] as Item[],
  discount: 0,
  entry_amount: 0,
  installments_count: 1,
  first_due_date: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10),
  notes: "",
});

function statusBadge(s: string) {
  const map: Record<string, { label: string; variant: any }> = {
    draft: { label: "Rascunho", variant: "outline" },
    sent: { label: "Enviada", variant: "default" },
    accepted: { label: "Aceita", variant: "secondary" },
    canceled: { label: "Cancelada", variant: "destructive" },
  };
  const m = map[s] || map.draft;
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function VendasPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const upsert = useServerFn(upsertSalesReceipt);
  const mSent = useServerFn(markSaleSent);
  const mCancel = useServerFn(cancelSale);
  const getFiles = useServerFn(getSaleSignedFiles);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<any | null>(null);
  const [viewFiles, setViewFiles] = useState<{ selfie_url: string | null; signature_url: string | null } | null>(null);

  const { data: customers } = useQuery({
    queryKey: ["customers-light"],
    queryFn: async () => (await supabase.from("customers").select("id,name,document,email,phone").order("name")).data ?? [],
  });
  const { data: vendors } = useQuery({
    queryKey: ["vendors-light"],
    queryFn: async () => (await (supabase as any).from("vendors").select("id,name,commission_rate").eq("active", true).order("name")).data ?? [],
  });
  const { data: companyInfo } = useQuery({
    queryKey: ["setting", "company_info"],
    queryFn: async () => (await supabase.from("app_settings").select("value").eq("key", "company_info").maybeSingle()).data?.value ?? {},
  });
  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales-receipts"],
    queryFn: async () => (await (supabase as any).from("sales_receipts").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const totals = useMemo(() => {
    const itemsTotal = form.items.reduce((a, i) => a + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
    const total = Math.max(0, itemsTotal - Number(form.discount || 0));
    const financed = Math.max(0, total - Number(form.entry_amount || 0));
    const count = Math.max(1, Math.floor(Number(form.installments_count) || 1));
    const parcel = Math.round((financed / count) * 100) / 100;
    return { itemsTotal, total, financed, parcel, count };
  }, [form]);

  function updateItem(idx: number, patch: Partial<Item>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }

  function pickCustomer(id: string) {
    const c = (customers ?? []).find((x: any) => x.id === id);
    if (!c) return;
    setForm((f) => ({
      ...f, customer_id: id, customer_new: false,
      snap: {
        ...f.snap,
        name: c.name || "",
        document: maskDocument(c.document || ""),
        email: c.email || "",
        phone: maskPhone(c.phone || ""),
      },
    }));
  }

  async function lookupCep(raw: string) {
    const cep = unmask(raw);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (j?.erro) return;
      setForm((f) => ({
        ...f,
        snap: {
          ...f.snap,
          street: j.logradouro || f.snap.street,
          neighborhood: j.bairro || f.snap.neighborhood,
          city: j.localidade || f.snap.city,
          state: j.uf || f.snap.state,
          complement: j.complemento || f.snap.complement,
        },
      }));
    } catch {}
  }

  async function save() {
    if (!form.snap.name.trim()) return toast.error("Informe o nome do cliente");
    if (!form.items.length || form.items.some((i) => !i.description.trim() || !i.unit_price)) {
      return toast.error("Preencha os itens (descrição e valor)");
    }
    try {
      const res = await upsert({ data: {
        id: form.id ?? undefined,
        customer_id: form.customer_id || null,
        customer_snapshot: form.snap,
        vendor_id: form.vendor_id === "none" ? null : form.vendor_id,
        items: form.items.map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
        discount: Number(form.discount || 0),
        entry_amount: Number(form.entry_amount || 0),
        installments_count: Number(form.installments_count),
        first_due_date: form.first_due_date,
        notes: form.notes || undefined,
        receipt_number: form.receipt_number?.trim() || undefined,
      } });
      toast.success("Recibo salvo");
      setOpen(false);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["sales-receipts"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    }
  }

  async function sendLink(sale: any) {
    try {
      await mSent({ data: { id: sale.id } });
    } catch (e: any) {
      toast.warning(e?.message || "");
    }
    const link = publicSalesUrl(sale.accept_token);
    const msg = buildSalesReceiptWhatsAppMessage({ customerName: sale.customer_snapshot?.name, link });
    if (sale.customer_snapshot?.phone) {
      openWhatsAppComposer(sale.customer_snapshot.phone, msg);
    } else {
      navigator.clipboard.writeText(link).catch(() => undefined);
      toast.info("Link copiado (cliente sem telefone)");
    }
    qc.invalidateQueries({ queryKey: ["sales-receipts"] });
  }

  async function openView(sale: any) {
    setViewing(sale);
    setViewFiles(null);
    if (sale.selfie_path || sale.signature_path) {
      try { setViewFiles(await getFiles({ data: { id: sale.id } })); } catch {}
    }
  }

  async function printSale(sale: any) {
    let files = viewFiles;
    if (!files && (sale.selfie_path || sale.signature_path)) {
      try { files = await getFiles({ data: { id: sale.id } }); setViewFiles(files); } catch {}
    }
    const contractNumber = await getContractNumberForSale(sale);
    printFilledReceipt(sale, files, companyInfo || {}, contractNumber);
  }

  async function printPromissory(sale: any) {
    let files = viewFiles;
    if (!files && (sale.selfie_path || sale.signature_path)) {
      try { files = await getFiles({ data: { id: sale.id } }); setViewFiles(files); } catch {}
    }
    const contractNumber = await getContractNumberForSale(sale);
    printSalesPromissoryNote(sale, files, companyInfo || {}, contractNumber);
  }

  async function getContractNumberForSale(sale: any) {
    try {
      if (sale.contract_id) {
        const { data } = await (supabase as any).from("contracts").select("contract_number,description").eq("id", sale.contract_id).maybeSingle();
        if (data?.contract_number || data?.description) return data.contract_number || data.description;
      }
      if (sale.customer_id) {
        const { data } = await supabase.from("customers").select("contract_number").eq("id", sale.customer_id).maybeSingle();
        if ((data as any)?.contract_number) return (data as any).contract_number;
      }
    } catch {}
    return sale.receipt_number || null;
  }

  const filtered = (sales ?? []).filter((s: any) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      s.customer_snapshot?.name?.toLowerCase().includes(t) ||
      s.receipt_number?.toLowerCase().includes(t) ||
      s.customer_snapshot?.document?.toLowerCase().includes(t)
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ShoppingBag className="w-7 h-7" /> Departamento de Vendas</h1>
          <p className="text-muted-foreground mt-1">Recibos de venda com aceite digital (selfie + assinatura).</p>
        </div>
        {canEdit && (
          <Button onClick={() => { setForm(emptyForm()); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Novo recibo
          </Button>
        )}
      </header>

      <Card><CardContent className="pt-6">
        <div className="mb-4">
          <Input placeholder="Buscar por cliente, documento ou nº..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p>
          : !filtered.length ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhum recibo encontrado.</p>
          : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Emitido</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.customer_snapshot?.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.receipt_number || s.id.slice(0, 8)}</TableCell>
                  <TableCell>{brl(s.total_amount)}</TableCell>
                  <TableCell>{s.installments_count}× {brl(s.installment_amount)}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
                  <TableCell>{fmtDate(s.created_at)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" title="Visualizar" onClick={() => openView(s)}><Eye className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" title="Imprimir / Arquivar" onClick={() => printSale(s)}><Printer className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" title="Nota promissória" onClick={() => printPromissory(s)}><FileText className="w-4 h-4" /></Button>
                    {s.status !== "accepted" && s.status !== "canceled" && (
                      <>
                        <Button size="icon" variant="ghost" title="Copiar link" onClick={() => {
                          navigator.clipboard.writeText(publicSalesUrl(s.accept_token));
                          toast.success("Link copiado");
                        }}><Copy className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Enviar por WhatsApp" onClick={() => sendLink(s)}>
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                        {canEdit && (
                          <Button size="icon" variant="ghost" title="Cancelar" onClick={async () => {
                            if (!confirm("Cancelar este recibo?")) return;
                            try { await mCancel({ data: { id: s.id } }); toast.success("Cancelado"); qc.invalidateQueries({ queryKey: ["sales-receipts"] }); }
                            catch (e: any) { toast.error(e?.message || "Erro"); }
                          }}><Ban className="w-4 h-4" /></Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Novo recibo de venda</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Card><CardHeader><CardTitle className="text-sm">Cliente</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Cliente existente</Label>
                    <Select value={form.customer_id || "none"} onValueChange={(v) => v === "none" ? setForm((f) => ({ ...f, customer_id: "", customer_new: true })) : pickCustomer(v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione ou preencha novo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Novo cliente —</SelectItem>
                        {customers?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Nº do recibo (opcional)</Label><Input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>Nome *</Label><Input value={form.snap.name} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, name: e.target.value } }))} /></div>
                  <div><Label>CPF/CNPJ</Label><Input value={form.snap.document} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, document: maskDocument(e.target.value) } }))} /></div>
                  <div><Label>Email</Label><Input value={form.snap.email} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, email: e.target.value } }))} /></div>
                  <div><Label>Telefone</Label><Input value={form.snap.phone} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, phone: maskPhone(e.target.value) } }))} /></div>
                </div>
                <div className="grid md:grid-cols-4 gap-3">
                  <div>
                    <Label>CEP</Label>
                    <Input
                      value={form.snap.cep}
                      maxLength={9}
                      onChange={(e) => {
                        const v = maskCep(e.target.value);
                        setForm((f) => ({ ...f, snap: { ...f.snap, cep: v } }));
                        if (unmask(v).length === 8) lookupCep(v);
                      }}
                    />
                  </div>
                  <div className="md:col-span-2"><Label>Rua/Logradouro</Label><Input value={form.snap.street} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, street: e.target.value } }))} /></div>
                  <div><Label>Número</Label><Input value={form.snap.number} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, number: e.target.value } }))} /></div>
                </div>
                <div className="grid md:grid-cols-4 gap-3">
                  <div><Label>Quadra</Label><Input value={form.snap.quadra} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, quadra: e.target.value } }))} /></div>
                  <div><Label>Bairro</Label><Input value={form.snap.neighborhood} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, neighborhood: e.target.value } }))} /></div>
                  <div><Label>Cidade</Label><Input value={form.snap.city} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, city: e.target.value } }))} /></div>
                  <div><Label>UF</Label><Input value={form.snap.state} maxLength={2} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, state: e.target.value.toUpperCase() } }))} /></div>
                </div>
                <div><Label>Complemento</Label><Input value={form.snap.complement} onChange={(e) => setForm((f) => ({ ...f, snap: { ...f.snap, complement: e.target.value } }))} /></div>
              </CardContent>
            </Card>

            <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm">Itens</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { description: "", quantity: 1, unit_price: 0 }] }))}>
                <Plus className="w-3 h-3 mr-1" /> Adicionar item
              </Button>
            </CardHeader>
              <CardContent className="space-y-2">
                {form.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-6"><Label className="text-xs">Descrição</Label><Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} /></div>
                    <div className="col-span-2"><Label className="text-xs">Qtd</Label><Input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></div>
                    <div className="col-span-3"><Label className="text-xs">Valor unit. (R$)</Label><Input type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} /></div>
                    <div className="col-span-1">
                      <Button size="icon" variant="ghost" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} disabled={form.items.length === 1}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="text-sm text-muted-foreground pt-2">Subtotal: <b>{brl(totals.itemsTotal)}</b></p>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-sm">Acordo de parcelamento</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                  <div><Label>Desconto (R$)</Label><Input type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} /></div>
                  <div><Label>Entrada (R$)</Label><Input type="number" step="0.01" value={form.entry_amount} onChange={(e) => setForm({ ...form, entry_amount: Number(e.target.value) })} /></div>
                  <div><Label>Vendedor</Label>
                    <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem vendedor</SelectItem>
                        {vendors?.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>Nº parcelas</Label><Input type="number" min="1" value={form.installments_count} onChange={(e) => setForm({ ...form, installments_count: Number(e.target.value) })} /></div>
                  <div><Label>1º vencimento</Label><Input type="date" value={form.first_due_date} onChange={(e) => setForm({ ...form, first_due_date: e.target.value })} /></div>
                </div>
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  Total: <b>{brl(totals.total)}</b> · Financiado: <b>{brl(totals.financed)}</b> ·
                  Parcelamento: <b>{totals.count}× {brl(totals.parcel)}</b>
                </div>
                <div><Label>Observações</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter><Button onClick={save}>Salvar recibo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => { if (!v) { setViewing(null); setViewFiles(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Recibo {viewing?.receipt_number ? `Nº ${viewing.receipt_number}` : ""}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => printSale(viewing)}>
                  <Printer className="w-4 h-4 mr-1" /> Imprimir / Arquivar
                </Button>
                <Button size="sm" variant="outline" onClick={() => printPromissory(viewing)}>
                  <FileText className="w-4 h-4 mr-1" /> Nota Promissória
                </Button>
              </div>
              <p><b>Cliente:</b> {viewing.customer_snapshot?.name} {viewing.customer_snapshot?.document ? `· ${viewing.customer_snapshot.document}` : ""}</p>
              <p><b>Status:</b> {statusBadge(viewing.status)}</p>
              <div className="rounded border divide-y">
                {(viewing.items || []).map((it: any, i: number) => (
                  <div key={i} className="flex justify-between p-2">
                    <span>{it.description} <span className="text-muted-foreground">({it.quantity}× {brl(it.unit_price)})</span></span>
                    <span className="font-medium">{brl(Number(it.quantity) * Number(it.unit_price))}</span>
                  </div>
                ))}
              </div>
              <p><b>Total:</b> {brl(viewing.total_amount)} · <b>Entrada:</b> {brl(viewing.entry_amount)} · <b>Parcelas:</b> {viewing.installments_count}× {brl(viewing.installment_amount)}</p>
              <p><b>1º vencimento:</b> {fmtDate(viewing.first_due_date)}</p>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Nota Promissória</p>
                <p className="text-xs text-muted-foreground mt-1">
                  A nota promissória é gerada com o saldo parcelado ({brl(Math.max(0, Number(viewing.total_amount || 0) - Number(viewing.entry_amount || 0)) || Number(viewing.total_amount || 0))}) e fica vinculada ao aceite digital do recibo.
                </p>
              </div>
              <p className="text-xs text-muted-foreground break-all">
                Link público: {publicSalesUrl(viewing.accept_token)}
              </p>
              {viewing.accepted_at && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
                  <p className="font-semibold">Firmado por {viewing.accepted_name} ({viewing.accepted_document})</p>
                  <p className="text-xs text-muted-foreground">em {new Date(viewing.accepted_at).toLocaleString("pt-BR")} · IP {viewing.accepted_ip || "—"}</p>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Selfie</p>
                      {viewFiles?.selfie_url ? <img src={viewFiles.selfie_url} alt="Selfie" className="w-full max-w-[240px] rounded border" /> : <p className="text-xs text-muted-foreground">Carregando...</p>}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Assinatura</p>
                      {viewFiles?.signature_url ? <img src={viewFiles.signature_url} alt="Assinatura" className="w-full max-w-[240px] rounded border bg-white" /> : <p className="text-xs text-muted-foreground">Carregando...</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}