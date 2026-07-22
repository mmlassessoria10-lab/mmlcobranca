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
import { toast } from "sonner";
import { brl, fmtDate, maskDocument, maskPhone, maskCep, unmask } from "@/lib/format";
import { upsertSalesReceipt, markSaleSent, cancelSale, getSaleSignedFiles } from "@/lib/sales/sales.functions";
import { openWhatsAppComposer, buildSalesReceiptWhatsAppMessage, publicSalesUrl } from "@/lib/communication";

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