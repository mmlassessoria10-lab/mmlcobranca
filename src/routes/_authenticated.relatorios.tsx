import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { processRemindersFn } from "@/lib/reminders/process.functions";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { brl, fmtDate, installmentStatus } from "@/lib/format";
import { Download, Send, CheckCircle2, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios | Photogenic" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const [status, setStatus] = useState<"todos" | "pendente" | "paga" | "atrasada">("todos");
  const [q, setQ] = useState("");
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const runReminders = useServerFn(processRemindersFn);
  const { isAdmin, hasRole } = useAuth();
  const canPay = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payDate, setPayDate] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editPaidDate, setEditPaidDate] = useState<string>("");

  function openEdit(inst: any) {
    setEditTarget(inst);
    setEditAmount(Number(inst.amount).toFixed(2));
    setEditDueDate(inst.due_date ?? "");
    setEditPaidDate(inst.paid_at ? String(inst.paid_at).slice(0, 10) : "");
  }

  async function confirmEdit() {
    if (!editTarget) return;
    const valor = Number(editAmount.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Informe um valor válido");
    if (!editDueDate) return toast.error("Informe a data de vencimento");
    const patch: any = { amount: valor, due_date: editDueDate };
    if (editTarget.paid_at) {
      if (!editPaidDate) return toast.error("Informe a data do pagamento");
      patch.paid_at = new Date(editPaidDate + "T12:00:00").toISOString();
    }
    const { error } = await supabase.from("installments").update(patch).eq("id", editTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Parcela atualizada");
    setEditTarget(null);
    qc.invalidateQueries({ queryKey: ["report-installments"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function confirmPay() {
    if (!payTarget) return;
    const valor = Number(payAmount.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      return toast.error("Informe um valor válido");
    }
    const esperado = Number(payTarget.amount);
    if (Math.abs(valor - esperado) > 0.009) {
      const ok = confirm(
        `Valor informado (${brl(valor)}) difere do valor da parcela (${brl(esperado)}). Confirmar mesmo assim?`,
      );
      if (!ok) return;
    }
    const iso = payDate
      ? new Date(payDate + "T12:00:00").toISOString()
      : new Date().toISOString();
    const { error } = await supabase
      .from("installments")
      .update({ paid_at: iso, status: "paga", amount: valor })
      .eq("id", payTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Baixa registrada");
    setPayTarget(null);
    qc.invalidateQueries({ queryKey: ["report-installments"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function reopen(inst: any) {
    const { error } = await supabase
      .from("installments")
      .update({ paid_at: null, status: "pendente" })
      .eq("id", inst.id);
    if (error) return toast.error(error.message);
    toast.success("Parcela reaberta");
    qc.invalidateQueries({ queryKey: ["report-installments"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function removeInstallment(inst: any) {
    if (!confirm(`Excluir a parcela ${inst.number} de ${inst.contracts?.customers?.name ?? ""}? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("installments").delete().eq("id", inst.id);
    if (error) return toast.error(error.message);
    toast.success("Parcela excluída");
    qc.invalidateQueries({ queryKey: ["report-installments"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function reenviarLembretes() {
    setSending(true);
    const t = toast.loading("Enviando lembretes...");
    try {
      const r = await runReminders();
      toast.success(
        `Lembretes processados: ${r.sent} enviado(s), ${r.skipped} ignorado(s), ${r.errors} erro(s).`,
        { id: t },
      );
      qc.invalidateQueries({ queryKey: ["report-installments"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao processar lembretes", { id: t });
    } finally {
      setSending(false);
    }
  }

  const { data } = useQuery({
    queryKey: ["report-installments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("installments")
        .select("id,number,due_date,amount,paid_at,contracts!inner(id,description,contract_number,legal_status,customers(name))")
        .not("contracts.legal_status", "eq", "juridico")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    return (data ?? []).map((i: any) => {
      const st = installmentStatus(i.due_date, i.paid_at);
      const kind: "paga" | "atrasada" | "pendente" = i.paid_at ? "paga" : st.overdue ? "atrasada" : "pendente";
      return { ...i, _kind: kind, _status: st };
    });
  }, [data]);

  const filtered = rows.filter((r: any) => {
    if (status !== "todos" && r._kind !== status) return false;
    if (q) {
      const t = q.toLowerCase();
      if (!(r.contracts?.customers?.name?.toLowerCase().includes(t) ||
            r.contracts?.description?.toLowerCase().includes(t) ||
            r.contracts?.contract_number?.toLowerCase().includes(t))) return false;
    }
    return true;
  });

  const totals = filtered.reduce(
    (acc: any, r: any) => {
      const v = Number(r.amount);
      acc.total += v;
      if (r._kind === "paga") acc.pago += v;
      else if (r._kind === "atrasada") acc.atrasado += v;
      else acc.pendente += v;
      return acc;
    },
    { total: 0, pago: 0, pendente: 0, atrasado: 0 }
  );

  function exportCsv() {
    const header = ["Cliente", "Nº Contrato", "Contrato", "Parcela", "Vencimento", "Valor", "Status"];
    const lines = [header.join(";")];
    filtered.forEach((r: any) => {
      lines.push([
        r.contracts?.customers?.name ?? "",
        r.contracts?.contract_number ?? "",
        r.contracts?.description ?? "",
        r.number,
        fmtDate(r.due_date),
        Number(r.amount).toFixed(2).replace(".", ","),
        r._kind,
      ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";"));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-parcelas-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Análise de parcelas por status, contrato e cliente</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{brl(totals.total)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pago</p><p className="text-xl font-bold text-emerald-600">{brl(totals.pago)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pendente</p><p className="text-xl font-bold text-amber-600">{brl(totals.pendente)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Atrasado</p><p className="text-xl font-bold text-destructive">{brl(totals.atrasado)}</p></CardContent></Card>
      </div>

      <Card><CardContent className="pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Buscar por cliente, nº ou contrato..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="atrasada">Em atraso</SelectItem>
              <SelectItem value="paga">Pagas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Exportar CSV</Button>
          <Button onClick={reenviarLembretes} disabled={sending}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Enviando..." : "Reenviar lembretes"}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Nº Contrato</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              {canPay && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.contracts?.customers?.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.contracts?.contract_number || "—"}</TableCell>
                <TableCell>
                  <Link to="/contratos/$id" params={{ id: r.contracts.id }} className="hover:underline">
                    {r.contracts.description}
                  </Link>
                </TableCell>
                <TableCell>{r.number}</TableCell>
                <TableCell>{fmtDate(r.due_date)}</TableCell>
                <TableCell>{brl(r.amount)}</TableCell>
                <TableCell><Badge variant={r._status.variant}>{r._status.label}</Badge></TableCell>
                {canPay && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />Editar
                      </Button>
                      {r.paid_at ? (
                        <Button size="sm" variant="ghost" onClick={() => reopen(r)}>
                          Reabrir
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => { setPayTarget(r); setPayDate(""); setPayAmount(Number(r.amount).toFixed(2)); }}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Dar baixa
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeInstallment(r)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum resultado.</p>}
      </CardContent></Card>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dar baixa na parcela</DialogTitle>
            <DialogDescription>
              {payTarget && (
                <>Parcela {payTarget.number} · {brl(payTarget.amount)} · venc. {fmtDate(payTarget.due_date)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pay-date-rel">Data do pagamento</Label>
            <Input
              id="pay-date-rel"
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Deixe em branco para usar a data de hoje.</p>
            <Label htmlFor="pay-amount-rel" className="pt-2 block">Valor recebido (R$)</Label>
            <Input
              id="pay-amount-rel"
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            {payTarget && (
              <p className="text-xs text-muted-foreground">
                Valor da parcela: <strong>{brl(payTarget.amount)}</strong>.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayTarget(null)}>Cancelar</Button>
            <Button onClick={confirmPay}>Confirmar baixa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar parcela</DialogTitle>
            <DialogDescription>
              {editTarget && (
                <>Parcela {editTarget.number} · {editTarget.contracts?.customers?.name}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Valor (R$)</Label>
            <Input id="edit-amount" type="number" step="0.01" min="0" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            <Label htmlFor="edit-due" className="pt-2 block">Vencimento</Label>
            <Input id="edit-due" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
            {editTarget?.paid_at && (
              <>
                <Label htmlFor="edit-paid" className="pt-2 block">Data do pagamento</Label>
                <Input id="edit-paid" type="date" value={editPaidDate} onChange={(e) => setEditPaidDate(e.target.value)} />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={confirmEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}