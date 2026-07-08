import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, fmtDate, installmentStatus } from "@/lib/format";
import { ArrowLeft, CheckCircle2, MessageCircle, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sendInstallmentReminder } from "@/lib/email/send-reminder";

export const Route = createFileRoute("/_authenticated/contratos/$id")({
  head: () => ({ meta: [{ title: "Contrato | Photogenic" }] }),
  component: ContractDetail,
});

function ContractDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canPay = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const canRemind = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const canDelete = isAdmin;
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payDate, setPayDate] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(*), installments(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      data.installments = (data.installments ?? []).sort((a: any, b: any) => a.number - b.number);
      return data;
    },
  });

  function openPay(inst: any) {
    setPayTarget(inst);
    setPayDate(""); // open / blank by default
    setPayAmount(Number(inst.amount).toFixed(2));
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
        `Valor informado (${brl(valor)}) difere do valor da parcela (${brl(esperado)}). Deseja confirmar mesmo assim?`,
      );
      if (!ok) return;
    }
    let isoPaid: string;
    if (payDate) {
      const d = new Date(payDate + "T12:00:00");
      if (isNaN(d.getTime())) return toast.error("Data inválida");
      isoPaid = d.toISOString();
    } else {
      isoPaid = new Date().toISOString();
    }
    const { error } = await supabase
      .from("installments")
      .update({ paid_at: isoPaid, status: "paga", amount: valor })
      .eq("id", payTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Baixa registrada");
    setPayTarget(null);
    qc.invalidateQueries({ queryKey: ["contract", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function reopen(inst: any) {
    const { error } = await supabase
      .from("installments")
      .update({ paid_at: null, status: "pendente" })
      .eq("id", inst.id);
    if (error) return toast.error(error.message);
    toast.success("Parcela reaberta");
    qc.invalidateQueries({ queryKey: ["contract", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function sendEmail(inst: any) {
    if (!data?.customers?.email) return toast.error("Cliente sem e-mail cadastrado");
    const t = toast.loading("Enviando e-mail...");
    try {
      await sendInstallmentReminder({
        installmentId: inst.id,
        customerName: data.customers.name,
        customerEmail: data.customers.email,
        contractDescription: data.description,
        installmentNumber: inst.number,
        installmentsTotal: data.installments_count,
        amount: Number(inst.amount),
        dueDate: inst.due_date,
      });
      await supabase.from("installments").update({
        last_reminder_sent_at: new Date().toISOString(),
        reminder_count: (inst.reminder_count ?? 0) + 1,
      }).eq("id", inst.id);
      toast.success("E-mail enviado", { id: t });
      qc.invalidateQueries({ queryKey: ["contract", id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar", { id: t });
    }
  }

  function whatsappLink(inst: any) {
    const phone = (data?.customers?.phone ?? "").replace(/\D/g, "");
    const st = installmentStatus(inst.due_date, inst.paid_at);
    const msg =
      `Olá ${data?.customers?.name}, lembrete sobre o contrato "${data?.description}": ` +
      `parcela ${inst.number}/${data?.installments_count} no valor de ${brl(inst.amount)}, ` +
      `vencimento ${fmtDate(inst.due_date)}${st.overdue ? ` (${st.daysLate} dias em atraso)` : ""}.`;
    return `https://wa.me/${phone.length === 11 ? "55" + phone : phone}?text=${encodeURIComponent(msg)}`;
  }

  async function removeContract() {
    if (!confirm("Excluir contrato e todas as parcelas?")) return;
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Contrato excluído");
    window.location.href = "/contratos";
  }

  if (isLoading || !data) return <p className="text-muted-foreground">Carregando...</p>;

  const ins = data.installments;
  const pagas = ins.filter((i: any) => i.paid_at).length;
  const pagoValor = ins.filter((i: any) => i.paid_at).reduce((a: number, i: any) => a + Number(i.amount), 0);
  const aberto = Number(data.total_amount) - pagoValor;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild><Link to="/contratos"><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Link></Button>
      </div>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{data.description}</h1>
          <p className="text-muted-foreground mt-1">
            Cliente: <strong className="text-foreground">{data.customers.name}</strong>
            {data.customers.document && <> · {data.customers.document}</>}
          </p>
        </div>
        {canDelete && (
          <Button variant="destructive" size="sm" onClick={removeContract}>
            <Trash2 className="w-4 h-4 mr-2" />Excluir
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{brl(data.total_amount)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pago</p><p className="text-xl font-bold text-emerald-600">{brl(pagoValor)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Em aberto</p><p className="text-xl font-bold text-amber-600">{brl(aberto)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Parcelas pagas</p><p className="text-xl font-bold">{pagas}/{data.installments_count}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Parcelas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Nº</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Baixa</TableHead>
                <TableHead>Último lembrete</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ins.map((i: any) => {
                const st = installmentStatus(i.due_date, i.paid_at);
                return (
                  <TableRow key={i.id}>
                    <TableCell>{i.number}</TableCell>
                    <TableCell>{fmtDate(i.due_date)}</TableCell>
                    <TableCell className="font-medium">{brl(i.amount)}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {i.paid_at ? fmtDate(i.paid_at) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {i.last_reminder_sent_at ? fmtDate(i.last_reminder_sent_at) : "—"}
                      {i.reminder_count > 0 && <span className="ml-1">({i.reminder_count})</span>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {!i.paid_at && canRemind && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => sendEmail(i)}>
                            <Mail className="w-3.5 h-3.5 mr-1" />E-mail
                          </Button>
                          {data.customers.phone && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={whatsappLink(i)} target="_blank" rel="noreferrer">
                                <MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp
                              </a>
                            </Button>
                          )}
                        </>
                      )}
                      {canPay && (
                        <Button
                          size="sm"
                          variant={i.paid_at ? "ghost" : "default"}
                          onClick={() => (i.paid_at ? reopen(i) : openPay(i))}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          {i.paid_at ? "Reabrir" : "Dar baixa"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            <Label htmlFor="pay-date">Data do pagamento</Label>
            <Input
              id="pay-date"
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              placeholder="Em aberto (usa hoje)"
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para usar a data de hoje.
            </p>
            <Label htmlFor="pay-amount" className="pt-2 block">Valor recebido (R$)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            {payTarget && (
              <p className="text-xs text-muted-foreground">
                Valor da parcela: <strong>{brl(payTarget.amount)}</strong>. Ajuste se necessário.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayTarget(null)}>Cancelar</Button>
            <Button onClick={confirmPay}>Confirmar baixa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}