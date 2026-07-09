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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate } from "@/lib/format";
import { Mail, Plus, Printer, Save, Trash2, FileText, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações Extrajudiciais | Photogenic" }] }),
  component: NotificacoesPage,
});

const FINE_RATE = 0.02; // 2%
const DAILY_INTEREST = 0.00034; // 0,034% ao dia

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
      const updated = amount + fine + interest;
      return { ...i, days, amount, fine, interest, updated };
    })
    .filter(Boolean) as any[];
  items.sort((a, b) => {
    const d = a.due_date.localeCompare(b.due_date);
    return d !== 0 ? d : (a.number ?? 0) - (b.number ?? 0);
  });
  const original = items.reduce((a, i) => a + i.amount, 0);
  const fine = items.reduce((a, i) => a + i.fine, 0);
  const interest = items.reduce((a, i) => a + i.interest, 0);
  const updated = items.reduce((a, i) => a + i.updated, 0);
  return { items, original, fine, interest, updated };
}

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
}

function NotificacoesPage() {
  const qc = useQueryClient();
  const { user, isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro") || hasRole("cobranca");

  const [tplOpen, setTplOpen] = useState(false);
  const [tplEdit, setTplEdit] = useState<any | null>(null);
  const [tplForm, setTplForm] = useState({ name: "", subject: "", body: "" });

  const [genOpen, setGenOpen] = useState(false);
  const [selCustomer, setSelCustomer] = useState<string>("");
  const [selContract, setSelContract] = useState<string>("");
  const [selTemplate, setSelTemplate] = useState<string>("");
  const [previewBody, setPreviewBody] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");

  const { data: templates } = useQuery({
    queryKey: ["notif-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notification_templates").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sent } = useQuery({
    queryKey: ["notif-sent"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notifications_sent")
        .select("*, customers(name,document), contracts(contract_number,description), notification_templates(name)")
        .order("sent_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["notif-customers"],
    enabled: genOpen,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customers")
        .select("id,name,document,email,phone")
        .order("name")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["notif-contracts", selCustomer],
    enabled: !!selCustomer,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contracts")
        .select("id,description,contract_number,installments(id,number,due_date,amount,paid_at)")
        .eq("customer_id", selCustomer)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedCustomer = (customers ?? []).find((c: any) => c.id === selCustomer);
  const selectedContract = (contracts ?? []).find((c: any) => c.id === selContract);
  const selectedTemplate = (templates ?? []).find((t: any) => t.id === selTemplate);

  const overdue = useMemo(() => {
    if (!selectedContract) return { items: [], original: 0, fine: 0, interest: 0, updated: 0 };
    return computeOverdue(selectedContract.installments ?? []);
  }, [selectedContract]);

  function buildVars() {
    const tabela = overdue.items.length
      ? overdue.items
          .map((i) => `  • Parcela ${i.number} — venc. ${fmtDate(i.due_date)} — ${i.days} dia(s) em atraso — original ${brl(i.amount)} — atualizado ${brl(i.updated)}`)
          .join("\n")
      : "  (nenhuma parcela vencida)";
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
      tabela_parcelas: tabela,
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
    const payload: any = { name: tplForm.name.trim(), subject: tplForm.subject, body: tplForm.body };
    if (tplEdit) {
      const { error } = await (supabase as any).from("notification_templates").update(payload).eq("id", tplEdit.id);
      if (error) return toast.error(error.message);
    } else {
      payload.created_by = user?.id;
      const { error } = await (supabase as any).from("notification_templates").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Modelo salvo");
    setTplOpen(false); setTplEdit(null); setTplForm({ name: "", subject: "", body: "" });
    qc.invalidateQueries({ queryKey: ["notif-templates"] });
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Excluir este modelo?")) return;
    const { error } = await (supabase as any).from("notification_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Modelo excluído");
    qc.invalidateQueries({ queryKey: ["notif-templates"] });
  }

  async function registerSent() {
    if (!selectedCustomer || !previewBody) return toast.error("Gere a prévia primeiro");
    const { error } = await (supabase as any).from("notifications_sent").insert({
      customer_id: selectedCustomer.id,
      contract_id: selectedContract?.id ?? null,
      template_id: selectedTemplate?.id ?? null,
      subject: previewSubject,
      body: previewBody,
      original_amount: overdue.original,
      updated_amount: overdue.updated,
      fine_amount: overdue.fine,
      interest_amount: overdue.interest,
      overdue_count: overdue.items.length,
      sent_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Notificação registrada");
    qc.invalidateQueries({ queryKey: ["notif-sent"] });
  }

  function printPreview() {
    if (!previewBody) return toast.error("Gere a prévia primeiro");
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<html><head><title>${previewSubject || "Notificação"}</title>
      <style>body{font-family:Georgia,serif;padding:40px;line-height:1.6;color:#111;max-width:720px;margin:0 auto;white-space:pre-wrap;}
      h1{font-size:18px;text-transform:uppercase;text-align:center;margin-bottom:24px;}</style>
      </head><body><h1>${previewSubject || "Notificação"}</h1><div>${previewBody.replace(/</g,"&lt;")}</div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Mail className="w-7 h-7" /> Notificações Extrajudiciais</h1>
          <p className="text-muted-foreground mt-1">Modelos com dados do cliente e cálculo automático de multa (2%) + juros de mora (0,034%/dia).</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setTplEdit(null); setTplForm({ name: "", subject: "", body: "" }); setTplOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Novo modelo
            </Button>
            <Button onClick={() => { setGenOpen(true); setPreviewBody(""); setPreviewSubject(""); }}>
              <Send className="w-4 h-4 mr-2" /> Gerar notificação
            </Button>
          </div>
        )}
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Modelos disponíveis</CardTitle></CardHeader>
        <CardContent>
          {!templates?.length ? <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p> : (
            <div className="grid gap-2">
              {templates.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.subject || "sem assunto"}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setTplEdit(t); setTplForm({ name: t.name, subject: t.subject ?? "", body: t.body }); setTplOpen(true); }}>Editar</Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteTemplate(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Variáveis disponíveis: <code>{"{{cliente_nome}}"}</code> <code>{"{{cliente_documento}}"}</code> <code>{"{{cliente_email}}"}</code> <code>{"{{cliente_telefone}}"}</code> <code>{"{{contrato_numero}}"}</code> <code>{"{{contrato_descricao}}"}</code> <code>{"{{parcelas_atrasadas}}"}</code> <code>{"{{valor_original}}"}</code> <code>{"{{multa}}"}</code> <code>{"{{juros}}"}</code> <code>{"{{valor_atualizado}}"}</code> <code>{"{{tabela_parcelas}}"}</code> <code>{"{{data_hoje}}"}</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notificações enviadas</CardTitle></CardHeader>
        <CardContent>
          {!sent?.length ? <p className="text-sm text-muted-foreground">Nenhuma notificação registrada.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Contrato</TableHead><TableHead>Modelo</TableHead>
                <TableHead>Parc.</TableHead><TableHead>Original</TableHead><TableHead>Atualizado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sent.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{fmtDate(s.sent_at)}</TableCell>
                    <TableCell className="font-medium">{s.customers?.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.contracts?.contract_number ? `Nº ${s.contracts.contract_number}` : s.contracts?.description ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{s.notification_templates?.name ?? "—"}</Badge></TableCell>
                    <TableCell>{s.overdue_count}</TableCell>
                    <TableCell>{brl(s.original_amount)}</TableCell>
                    <TableCell className="font-medium text-amber-600">{brl(s.updated_amount)}</TableCell>
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
            <DialogTitle>{tplEdit ? "Editar modelo" : "Novo modelo"}</DialogTitle>
            <DialogDescription>Use as variáveis entre chaves duplas para inserir dados do cliente e valores atualizados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} /></div>
            <div><Label>Assunto</Label><Input value={tplForm.subject} onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })} /></div>
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
            <DialogTitle>Gerar notificação extrajudicial</DialogTitle>
            <DialogDescription>Selecione o cliente, contrato e modelo. Os valores são atualizados no momento em que a prévia é gerada.</DialogDescription>
          </DialogHeader>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Cliente</Label>
              <Select value={selCustomer} onValueChange={(v) => { setSelCustomer(v); setSelContract(""); setPreviewBody(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>{(customers ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contrato</Label>
              <Select value={selContract} onValueChange={(v) => { setSelContract(v); setPreviewBody(""); }} disabled={!selCustomer}>
                <SelectTrigger><SelectValue placeholder={selCustomer ? "Selecionar..." : "Escolha o cliente"} /></SelectTrigger>
                <SelectContent>{(contracts ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.contract_number ? `Nº ${c.contract_number} · ` : ""}{c.description}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo</Label>
              <Select value={selTemplate} onValueChange={setSelTemplate}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>{(templates ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {selectedContract && (
            <Card className="mt-3">
              <CardHeader><CardTitle className="text-sm">Débito atualizado</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Parcelas vencidas</p><p className="text-lg font-semibold">{overdue.items.length}</p></div>
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Original</p><p className="text-lg font-semibold">{brl(overdue.original)}</p></div>
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Multa + juros</p><p className="text-lg font-semibold">{brl(overdue.fine + overdue.interest)}</p></div>
                  <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Atualizado</p><p className="text-lg font-semibold text-amber-600">{brl(overdue.updated)}</p></div>
                </div>
                {overdue.items.length > 0 && (
                  <div className="text-xs max-h-40 overflow-auto border rounded p-2 bg-muted/30">
                    {overdue.items.map((i) => (
                      <div key={i.id}>Parc. {i.number} · venc. {fmtDate(i.due_date)} · {i.days}d · {brl(i.amount)} → <b>{brl(i.updated)}</b></div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={refreshPreview}><RefreshCw className="w-4 h-4 mr-2" /> Atualizar prévia</Button>
            <Button variant="outline" onClick={printPreview} disabled={!previewBody}><Printer className="w-4 h-4 mr-2" /> Imprimir / PDF</Button>
            <Button onClick={registerSent} disabled={!previewBody}><Send className="w-4 h-4 mr-2" /> Registrar envio</Button>
          </div>

          {previewBody && (
            <div className="mt-3">
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