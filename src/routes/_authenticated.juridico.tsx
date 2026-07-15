import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { brl, fmtDate } from "@/lib/format";
import { Scale, Plus, CheckCircle2, ExternalLink, ArrowRightCircle, Undo2, Trash2, Download, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/juridico")({
  head: () => ({ meta: [{ title: "Departamento Jurídico | Stillo Foto" }] }),
  component: JuridicoPage,
});

const STAGE_LABEL: Record<string, string> = {
  notificacao_extrajudicial: "Notificação extrajudicial",
  protesto: "Protesto",
  acao_judicial: "Ação judicial",
  acordo: "Acordo",
  encerrado: "Encerrado",
};

const EVENT_LABEL: Record<string, string> = {
  contato: "Contato",
  notificacao: "Notificação enviada",
  protocolo: "Protocolo",
  audiencia: "Audiência",
  acordo: "Acordo",
  baixa: "Baixa/Pagamento",
  outro: "Outro",
};

function JuridicoPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const [openCase, setOpenCase] = useState<any | null>(null);
  const [newEvent, setNewEvent] = useState({ event_type: "contato", event_date: new Date().toISOString().slice(0, 10), description: "", amount: "" });
  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState({ contract_id: "", stage: "notificacao_extrajudicial", attorney_name: "", honorary_amount: "", honorary_rate: "30", notes: "" });
  const [contractSearch, setContractSearch] = useState("");
  const [caseSearch, setCaseSearch] = useState("");

  const { data: eligible } = useQuery({
    queryKey: ["contracts-eligible-legal"],
    enabled: transferOpen && canEdit,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contracts")
        .select("id,description,contract_number,total_amount,legal_status,customers(name,document),installments(amount,paid_at)")
        .neq("legal_status", "juridico")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cases, isLoading } = useQuery({
    queryKey: ["legal-cases"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("legal_cases")
        .select("*, contracts(id,description,contract_number,total_amount,customers(name,document,phone,email),installments(amount,paid_at,due_date))")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["legal-events", openCase?.id],
    enabled: !!openCase,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("legal_case_events")
        .select("*")
        .eq("case_id", openCase.id)
        .order("event_date", { ascending: false });
      return data ?? [];
    },
  });

  function totals(c: any) {
    const ins = c.contracts?.installments ?? [];
    const aberto = ins.filter((i: any) => !i.paid_at).reduce((a: number, i: any) => a + Number(i.amount), 0);
    const pago = ins.filter((i: any) => i.paid_at).reduce((a: number, i: any) => a + Number(i.amount), 0);
    const today = new Date(); today.setHours(0,0,0,0);
    const atraso = ins.filter((i: any) => !i.paid_at && new Date(i.due_date + "T00:00:00") < today).length;
    return { aberto, pago, atraso };
  }

  const selectedContract = (eligible ?? []).find((c: any) => c.id === transfer.contract_id);
  const selectedAberto = selectedContract
    ? (selectedContract.installments ?? []).filter((i: any) => !i.paid_at).reduce((a: number, i: any) => a + Number(i.amount), 0)
    : 0;

  function applyRate(rate: string) {
    const r = Number(rate.replace(",", "."));
    if (!isNaN(r) && selectedAberto > 0) {
      setTransfer((t) => ({ ...t, honorary_rate: rate, honorary_amount: (selectedAberto * r / 100).toFixed(2) }));
    } else {
      setTransfer((t) => ({ ...t, honorary_rate: rate }));
    }
  }

  // ==== Reports aggregation ====
  const report = (() => {
    const list = cases ?? [];
    const byStage: Record<string, number> = {};
    let aReceber = 0, recebido = 0, honorarios = 0;
    for (const c of list) {
      byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
      const t = totals(c);
      aReceber += t.aberto;
      recebido += t.pago;
      honorarios += Number(c.honorary_amount ?? 0);
    }
    return { total: list.length, byStage, aReceber, recebido, honorarios };
  })();

  function exportCsv() {
    const rows = [
      ["Cliente","Documento","Contrato","Nº","Etapa","Advogado","Aberto em","Valor em aberto","Valor recebido","Honorários","Parcelas em atraso"],
      ...(cases ?? []).map((c: any) => {
        const t = totals(c);
        return [
          c.contracts?.customers?.name ?? "",
          c.contracts?.customers?.document ?? "",
          c.contracts?.description ?? "",
          c.contracts?.contract_number ?? "",
          STAGE_LABEL[c.stage] ?? c.stage,
          c.attorney_name ?? "",
          fmtDate(c.opened_at),
          t.aberto.toFixed(2).replace(".",","),
          t.pago.toFixed(2).replace(".",","),
          Number(c.honorary_amount ?? 0).toFixed(2).replace(".",","),
          String(t.atraso),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v: string) => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `juridico-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addEvent() {
    if (!openCase) return;
    if (!newEvent.description.trim()) return toast.error("Descreva o evento");
    const { error } = await (supabase as any).from("legal_case_events").insert({
      case_id: openCase.id,
      event_type: newEvent.event_type,
      event_date: newEvent.event_date,
      description: newEvent.description.trim(),
      amount: newEvent.amount ? Number(newEvent.amount.replace(",", ".")) : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Andamento registrado");
    setNewEvent({ event_type: "contato", event_date: new Date().toISOString().slice(0, 10), description: "", amount: "" });
    qc.invalidateQueries({ queryKey: ["legal-events", openCase.id] });
  }

  async function updateStage(stage: string) {
    if (!openCase) return;
    const patch: any = { stage };
    if (stage === "encerrado") patch.closed_at = new Date().toISOString();
    const { error } = await (supabase as any).from("legal_cases").update(patch).eq("id", openCase.id);
    if (error) return toast.error(error.message);
    if (stage === "encerrado") {
      await (supabase as any).from("contracts").update({ legal_status: "ativo" }).eq("id", openCase.contract_id);
    }
    toast.success("Etapa atualizada");
    setOpenCase({ ...openCase, ...patch });
    qc.invalidateQueries({ queryKey: ["legal-cases"] });
  }

  async function submitTransfer() {
    if (!transfer.contract_id) return toast.error("Selecione o contrato");
    const honor = transfer.honorary_amount ? Number(transfer.honorary_amount.replace(",", ".")) : null;
    const { error: e1 } = await (supabase as any).from("legal_cases").insert({
      contract_id: transfer.contract_id,
      stage: transfer.stage,
      attorney_name: transfer.attorney_name || null,
      honorary_amount: honor,
      notes: transfer.notes || null,
    });
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await (supabase as any).from("contracts").update({ legal_status: "juridico" }).eq("id", transfer.contract_id);
    if (e2) return toast.error(e2.message);
    toast.success("Contrato transferido para o jurídico");
    setTransferOpen(false);
    setTransfer({ contract_id: "", stage: "notificacao_extrajudicial", attorney_name: "", honorary_amount: "", honorary_rate: "30", notes: "" });
    setContractSearch("");
    qc.invalidateQueries({ queryKey: ["legal-cases"] });
    qc.invalidateQueries({ queryKey: ["contracts-eligible-legal"] });
  }

  async function returnCase(c: any) {
    if (!confirm(`Retornar o contrato de ${c.contracts?.customers?.name ?? ""} para ativo? O caso jurídico será removido.`)) return;
    const { error: e1 } = await (supabase as any).from("legal_case_events").delete().eq("case_id", c.id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await (supabase as any).from("legal_cases").delete().eq("id", c.id);
    if (e2) return toast.error(e2.message);
    await (supabase as any).from("contracts").update({ legal_status: "ativo" }).eq("id", c.contract_id);
    toast.success("Contrato retornado ao fluxo normal");
    setOpenCase(null);
    qc.invalidateQueries({ queryKey: ["legal-cases"] });
    qc.invalidateQueries({ queryKey: ["contracts-eligible-legal"] });
  }

  async function deleteCase(c: any) {
    if (!confirm(`Excluir definitivamente este lançamento jurídico? Esta ação não pode ser desfeita.`)) return;
    const { error: e1 } = await (supabase as any).from("legal_case_events").delete().eq("case_id", c.id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await (supabase as any).from("legal_cases").delete().eq("id", c.id);
    if (e2) return toast.error(e2.message);
    await (supabase as any).from("contracts").update({ legal_status: "ativo" }).eq("id", c.contract_id);
    toast.success("Lançamento excluído");
    setOpenCase(null);
    qc.invalidateQueries({ queryKey: ["legal-cases"] });
    qc.invalidateQueries({ queryKey: ["contracts-eligible-legal"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Scale className="w-7 h-7" /> Departamento Jurídico</h1>
          <p className="text-muted-foreground mt-1">{cases?.length ?? 0} caso(s) em andamento</p>
        </div>
        {canEdit && (
          <Button onClick={() => setTransferOpen(true)}>
            <ArrowRightCircle className="w-4 h-4 mr-2" /> Transferir contrato para o jurídico
          </Button>
        )}
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Relatórios do jurídico</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!cases?.length}>
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Casos</p>
              <p className="text-lg font-semibold">{report.total}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Valor a receber</p>
              <p className="text-lg font-semibold text-amber-600">{brl(report.aReceber)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Valor recebido</p>
              <p className="text-lg font-semibold text-emerald-600">{brl(report.recebido)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Honorários</p>
              <p className="text-lg font-semibold">{brl(report.honorarios)}</p>
            </div>
          </div>
          {report.total > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Por etapa</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(report.byStage).map(([k, v]) => (
                  <Badge key={k} variant="outline">{STAGE_LABEL[k] ?? k}: {v}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-sm text-muted-foreground space-y-1">
            <p><b className="text-foreground">Como funciona:</b> ao transferir um contrato, ele passa a ter status <b>Jurídico</b> e as cobranças normais são pausadas neste ambiente.</p>
            <p>Cada caso possui etapas (notificação, protesto, ação judicial, acordo) e um histórico de andamentos. Ao encerrar, o contrato retorna para <b>ativo</b>.</p>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="pt-6">
        <div className="mb-4">
          <Input
            placeholder="Localizar por cliente, nº do contrato, descrição ou advogado..."
            value={caseSearch}
            onChange={(e) => setCaseSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
        {(() => {
          const q = caseSearch.trim().toLowerCase();
          const filtered = !q ? (cases ?? []) : (cases ?? []).filter((c: any) =>
            c.contracts?.customers?.name?.toLowerCase().includes(q) ||
            c.contracts?.customers?.document?.toLowerCase().includes(q) ||
            c.contracts?.contract_number?.toLowerCase().includes(q) ||
            c.contracts?.description?.toLowerCase().includes(q) ||
            c.attorney_name?.toLowerCase().includes(q)
          );
          return isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p>
          : !cases?.length ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhum contrato em andamento no jurídico.</p>
          : !filtered.length ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhum caso encontrado para "{caseSearch}".</p>
          : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Valor em aberto</TableHead>
                <TableHead>Parcelas em atraso</TableHead>
                <TableHead>Advogado</TableHead>
                <TableHead>Aberto em</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => {
                const t = totals(c);
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-accent" onClick={() => setOpenCase(c)}>
                    <TableCell className="font-medium">{c.contracts?.customers?.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.contracts?.contract_number ? <><b>Nº {c.contracts.contract_number}</b> · </> : null}
                      {c.contracts?.description}
                    </TableCell>
                    <TableCell><Badge>{STAGE_LABEL[c.stage] ?? c.stage}</Badge></TableCell>
                    <TableCell className="font-medium">{brl(t.aberto)}</TableCell>
                    <TableCell><span className="text-destructive font-medium">{t.atraso}</span></TableCell>
                    <TableCell className="text-muted-foreground">{c.attorney_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(c.opened_at)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Retornar para ativo" onClick={() => returnCase(c)}>
                            <Undo2 className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Excluir lançamento" onClick={() => deleteCase(c)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                          <ExternalLink className="w-4 h-4 text-muted-foreground self-center ml-1" />
                        </div>
                      ) : (
                        <ExternalLink className="w-4 h-4 text-muted-foreground inline" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          );
        })()}
      </CardContent></Card>

      <Dialog open={!!openCase} onOpenChange={(o) => !o && setOpenCase(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          {openCase && (
            <>
              <DialogHeader>
                <DialogTitle>{openCase.contracts?.customers?.name}</DialogTitle>
                <DialogDescription>
                  Contrato: {openCase.contracts?.description}
                  {openCase.contracts?.contract_number && <> · Nº {openCase.contracts.contract_number}</>}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Etapa atual</p><p className="text-sm font-semibold">{STAGE_LABEL[openCase.stage]}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Em aberto</p><p className="text-sm font-semibold text-amber-600">{brl(totals(openCase).aberto)}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Honorários</p><p className="text-sm font-semibold">{openCase.honorary_amount ? brl(openCase.honorary_amount) : "—"}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Aberto em</p><p className="text-sm font-semibold">{fmtDate(openCase.opened_at)}</p></CardContent></Card>
              </div>

              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                {openCase.contracts?.customers?.document && <p>Documento: {openCase.contracts.customers.document}</p>}
                {openCase.contracts?.customers?.phone && <p>Telefone: {openCase.contracts.customers.phone}</p>}
                {openCase.contracts?.customers?.email && <p>E-mail: {openCase.contracts.customers.email}</p>}
                {openCase.notes && <p className="pt-2"><b>Notas:</b> {openCase.notes}</p>}
              </div>

              <div className="mt-4">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/contratos/$id" params={{ id: openCase.contract_id }}>Abrir contrato</Link>
                </Button>
              </div>

              {canEdit && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Label className="w-full">Alterar etapa</Label>
                  {(["notificacao_extrajudicial","protesto","acao_judicial","acordo","encerrado"] as const).map((s) => (
                    <Button key={s} size="sm" variant={openCase.stage === s ? "default" : "outline"} onClick={() => updateStage(s)}>
                      {s === "encerrado" && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                      {STAGE_LABEL[s]}
                    </Button>
                  ))}
                </div>
              )}

              <Card className="mt-4">
                <CardHeader><CardTitle className="text-base">Andamentos</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {canEdit && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border rounded-md p-3 bg-muted/30">
                      <Select value={newEvent.event_type} onValueChange={(v) => setNewEvent({ ...newEvent, event_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(EVENT_LABEL).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="date" value={newEvent.event_date} onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })} />
                      <Input placeholder="Valor (R$)" type="number" step="0.01" value={newEvent.amount} onChange={(e) => setNewEvent({ ...newEvent, amount: e.target.value })} />
                      <Button onClick={addEvent}><Plus className="w-4 h-4 mr-1" />Registrar</Button>
                      <Textarea className="md:col-span-4" placeholder="Descrição do andamento" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />
                    </div>
                  )}
                  {events?.length ? (
                    <div className="space-y-2">
                      {events.map((ev: any) => (
                        <div key={ev.id} className="border-l-2 border-primary/40 pl-3 py-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline">{EVENT_LABEL[ev.event_type]}</Badge>
                            <span className="text-muted-foreground">{fmtDate(ev.event_date)}</span>
                            {ev.amount && <span className="font-medium">{brl(ev.amount)}</span>}
                          </div>
                          <p className="text-sm mt-1">{ev.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum andamento registrado.</p>
                  )}
                </CardContent>
              </Card>

              <DialogFooter>
                {canEdit && (
                  <>
                    <Button variant="outline" onClick={() => returnCase(openCase)}>
                      <Undo2 className="w-4 h-4 mr-2" /> Retornar para ativo
                    </Button>
                    <Button variant="destructive" onClick={() => deleteCase(openCase)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Excluir
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => setOpenCase(null)}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transferir contrato para o jurídico</DialogTitle>
            <DialogDescription>Selecione o contrato e defina a etapa inicial. O contrato passará ao status Jurídico.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Buscar contrato (cliente, documento ou nº)</Label>
              <Input placeholder="Digite para filtrar..." value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} />
            </div>
            <div>
              <Label>Contrato</Label>
              <Select value={transfer.contract_id} onValueChange={(v) => {
                const c = (eligible ?? []).find((x: any) => x.id === v);
                const aberto = c ? (c.installments ?? []).filter((i: any) => !i.paid_at).reduce((a: number, i: any) => a + Number(i.amount), 0) : 0;
                const r = Number((transfer.honorary_rate || "0").replace(",", "."));
                setTransfer({ ...transfer, contract_id: v, honorary_amount: aberto > 0 && r > 0 ? (aberto * r / 100).toFixed(2) : transfer.honorary_amount });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(eligible ?? [])
                    .filter((c: any) => {
                      const q = contractSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (c.customers?.name ?? "").toLowerCase().includes(q) ||
                        (c.customers?.document ?? "").toLowerCase().includes(q) ||
                        (c.contract_number ?? "").toLowerCase().includes(q) ||
                        (c.description ?? "").toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 100)
                    .map((c: any) => {
                      const ab = (c.installments ?? []).filter((i: any) => !i.paid_at).reduce((a: number, i: any) => a + Number(i.amount), 0);
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {c.customers?.name} {c.contract_number ? `· Nº ${c.contract_number}` : ""} · a receber {brl(ab)}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            {transfer.contract_id && (
              <div className="rounded-md border p-3 bg-muted/30 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Valor a receber (parcelas em aberto)</span><span className="font-semibold text-amber-600">{brl(selectedAberto)}</span></div>
                <p className="text-xs text-muted-foreground mt-1">Somente parcelas não pagas são consideradas na base de honorários.</p>
              </div>
            )}
            <div>
              <Label>Etapa inicial</Label>
              <Select value={transfer.stage} onValueChange={(v) => setTransfer({ ...transfer, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STAGE_LABEL).filter(([k]) => k !== "encerrado").map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Advogado responsável</Label>
              <Input value={transfer.attorney_name} onChange={(e) => setTransfer({ ...transfer, attorney_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>% Honorários sobre a receber</Label>
                <Input type="number" step="0.01" value={transfer.honorary_rate} onChange={(e) => applyRate(e.target.value)} />
              </div>
              <div>
                <Label>Honorários (R$)</Label>
                <Input type="number" step="0.01" value={transfer.honorary_amount} onChange={(e) => setTransfer({ ...transfer, honorary_amount: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button onClick={submitTransfer}><ArrowRightCircle className="w-4 h-4 mr-2" />Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}