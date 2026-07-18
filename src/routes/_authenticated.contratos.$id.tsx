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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, fmtDate, installmentStatus } from "@/lib/format";
import { ArrowLeft, CheckCircle2, MessageCircle, Mail, Trash2, ArrowRightLeft, Scale, Link2, Copy, Send, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { buildInstallmentReminderWhatsAppMessage, openEmailComposer, openWhatsAppComposer } from "@/lib/communication";
import { useServerFn } from "@tanstack/react-start";
import { createAsaasPaymentForInstallment, syncContractToAsaas } from "@/lib/asaas/asaas.functions";

export const Route = createFileRoute("/_authenticated/contratos/$id")({
  head: () => ({ meta: [{ title: "Contrato | Stillo Foto" }] }),
  component: ContractDetail,
});

function ContractDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canPay = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const canRemind = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const canDelete = isAdmin;
  const canAsaas = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const generateAsaas = useServerFn(createAsaasPaymentForInstallment);
  const syncAsaas = useServerFn(syncContractToAsaas);
  const [asaasBusy, setAsaasBusy] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [sendLink, setSendLink] = useState<{ inst: any; message: string } | null>(null);

  async function generateAsaasLink(inst: any) {
    setAsaasBusy(inst.id);
    try {
      const res = await generateAsaas({ data: { installmentId: inst.id } });
      await navigator.clipboard.writeText(res.invoiceUrl).catch(() => {});
      toast.success(res.reused ? "Link Asaas já existente — copiado" : "Link Asaas gerado e copiado");
      qc.invalidateQueries({ queryKey: ["contract", id] });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar cobrança Asaas");
    } finally {
      setAsaasBusy(null);
    }
  }

  async function syncAllToAsaas() {
    if (!confirm("Exportar cliente e gerar cobranças Asaas para todas as parcelas em aberto sem link?")) return;
    setSyncBusy(true);
    try {
      const res = await syncAsaas({ data: { contractId: id } });
      const msg = `${res.created} cobrança(s) criada(s).` + (res.errors?.length ? ` ${res.errors.length} erro(s).` : "");
      if (res.errors?.length) toast.warning(msg + " " + res.errors.slice(0, 2).join(" | "));
      else toast.success(msg);
      qc.invalidateQueries({ queryKey: ["contract", id] });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao sincronizar com Asaas");
    } finally {
      setSyncBusy(false);
    }
  }

  function openSendLink(inst: any) {
    const name = data?.customers?.name || "";
    const label = `${inst.number}/${data?.installments_count}`;
    const defaultMsg =
      `Olá ${name},\n\n` +
      `Segue o link para pagamento da parcela ${label} — ${brl(inst.amount)} — vencimento ${fmtDate(inst.due_date)}.\n\n` +
      `Pague por PIX, boleto ou cartão:\n${inst.asaas_invoice_url}\n\n` +
      `Qualquer dúvida, estamos à disposição.`;
    setSendLink({ inst, message: defaultMsg });
  }

  function sendLinkWhatsApp() {
    if (!sendLink) return;
    const phone = data?.customers?.phone ?? "";
    let msg = sendLink.message;
    if (!msg.includes(sendLink.inst.asaas_invoice_url)) msg = `${msg}\n\n${sendLink.inst.asaas_invoice_url}`;
    if (!openWhatsAppComposer(phone, msg)) return toast.error("Cliente sem telefone cadastrado");
    toast.success("WhatsApp aberto com a mensagem.");
    setSendLink(null);
  }

  function sendLinkEmail() {
    if (!sendLink) return;
    const email = data?.customers?.email;
    if (!email) return toast.error("Cliente sem e-mail cadastrado");
    let msg = sendLink.message;
    if (!msg.includes(sendLink.inst.asaas_invoice_url)) msg = `${msg}\n\n${sendLink.inst.asaas_invoice_url}`;
    const subject = `Link de pagamento - Parcela ${sendLink.inst.number}/${data?.installments_count}`;
    if (!openEmailComposer(email, subject, msg)) return toast.error("Cliente sem e-mail cadastrado");
    toast.success("E-mail aberto com a mensagem.");
    setSendLink(null);
  }
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payDate, setPayDate] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalForm, setLegalForm] = useState({ stage: "notificacao_extrajudicial", attorney_name: "", honorary_amount: "", notes: "" });

  const { data: allContracts } = useQuery({
    queryKey: ["contracts-light"],
    queryFn: async () => (await supabase.from("contracts").select("id,description,customer_id,customers(name)").order("created_at",{ascending:false})).data ?? [],
  });

  async function doTransfer() {
    if (!transferTarget) return toast.error("Selecione o contrato destino");
    if (transferTarget === id) return toast.error("Destino não pode ser o mesmo contrato");
    if (!confirm("Todas as parcelas serão movidas para o contrato destino e este contrato será excluído. Confirmar?")) return;
    const { data: moved, error } = await (supabase as any).rpc("transfer_contract", { _source_contract_id: id, _target_contract_id: transferTarget });
    if (error) return toast.error(error.message);
    toast.success(`${moved} parcelas transferidas.`);
    window.location.href = `/contratos/${transferTarget}`;
  }

  async function sendToLegal() {
    const honor = legalForm.honorary_amount ? Number(legalForm.honorary_amount.replace(",", ".")) : null;
    const { error: e1 } = await (supabase as any).from("legal_cases").insert({
      contract_id: id,
      stage: legalForm.stage,
      attorney_name: legalForm.attorney_name || null,
      honorary_amount: honor,
      notes: legalForm.notes || null,
    });
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await (supabase as any).from("contracts").update({ legal_status: "juridico" }).eq("id", id);
    if (e2) return toast.error(e2.message);
    toast.success("Contrato enviado ao Departamento Jurídico");
    setLegalOpen(false);
    qc.invalidateQueries({ queryKey: ["contract", id] });
  }

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
    const st = installmentStatus(inst.due_date, inst.paid_at);
    const msg = buildInstallmentReminderWhatsAppMessage({
      customerName: data.customers.name,
      contractDescription: data.description,
      installmentLabel: `${inst.number}/${data.installments_count}`,
      amount: brl(inst.amount),
      dueDate: fmtDate(inst.due_date),
      daysLate: st.overdue ? st.daysLate : undefined,
    });
    const subject = `Lembrete de parcela ${inst.number}/${data.installments_count} - ${data.description}`;
    if (!openEmailComposer(data.customers.email, subject, msg)) return toast.error("Cliente sem e-mail cadastrado");
    await supabase.from("installments").update({
      last_reminder_sent_at: new Date().toISOString(),
      reminder_count: (inst.reminder_count ?? 0) + 1,
    }).eq("id", inst.id);
    toast.success("E-mail aberto. Confirme o envio no seu aplicativo de e-mail.");
    qc.invalidateQueries({ queryKey: ["contract", id] });
  }

  function sendWhatsApp(inst: any) {
    const phone = data?.customers?.phone ?? "";
    const st = installmentStatus(inst.due_date, inst.paid_at);
    const msg = buildInstallmentReminderWhatsAppMessage({
      customerName: data?.customers?.name,
      contractDescription: data?.description,
      installmentLabel: `${inst.number}/${data?.installments_count}`,
      amount: brl(inst.amount),
      dueDate: fmtDate(inst.due_date),
      daysLate: st.overdue ? st.daysLate : undefined,
    });
    if (!openWhatsAppComposer(phone, msg)) return toast.error("Cliente sem telefone cadastrado");
    toast.success("Mensagem copiada. Se o WhatsApp não abrir, cole no contato do cliente.");
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
            {data.contract_number && <> · Nº <strong className="text-foreground">{data.contract_number}</strong></>}
            {data.legal_status === "juridico" && (
              <Badge variant="destructive" className="ml-2">Jurídico</Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAsaas && (
            <Button size="sm" variant="outline" onClick={syncAllToAsaas} disabled={syncBusy}>
              <RefreshCcw className="w-4 h-4 mr-2" />{syncBusy ? "Sincronizando..." : "Sincronizar Asaas"}
            </Button>
          )}
          {(isAdmin || hasRole("financeiro")) && (
            <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />Transferir
            </Button>
          )}
          {(isAdmin || hasRole("financeiro") || hasRole("cobranca")) && data.legal_status !== "juridico" && (
            <Button size="sm" variant="outline" onClick={() => setLegalOpen(true)}>
              <Scale className="w-4 h-4 mr-2" />Enviar ao Jurídico
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" size="sm" onClick={removeContract}>
              <Trash2 className="w-4 h-4 mr-2" />Excluir
            </Button>
          )}
        </div>
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
                          <Button size="sm" variant="outline" onClick={() => sendWhatsApp(i)}>
                            <MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp
                          </Button>
                        </>
                      )}
                      {!i.paid_at && canAsaas && (
                        i.asaas_invoice_url ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(i.asaas_invoice_url); toast.success("Link copiado"); }}>
                              <Copy className="w-3.5 h-3.5 mr-1" />Copiar
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href={i.asaas_invoice_url} target="_blank" rel="noreferrer"><Link2 className="w-3.5 h-3.5 mr-1" />Abrir</a>
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openSendLink(i)}>
                              <Send className="w-3.5 h-3.5 mr-1" />Enviar link
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" disabled={asaasBusy === i.id} onClick={() => generateAsaasLink(i)}>
                            <Link2 className="w-3.5 h-3.5 mr-1" />{asaasBusy === i.id ? "Gerando..." : "Gerar Asaas"}
                          </Button>
                        )
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

      <Dialog open={!!sendLink} onOpenChange={(o) => !o && setSendLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar link de pagamento</DialogTitle>
            <DialogDescription>
              {sendLink && <>Parcela {sendLink.inst.number} · {brl(sendLink.inst.amount)} · venc. {fmtDate(sendLink.inst.due_date)}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              rows={10}
              value={sendLink?.message ?? ""}
              onChange={(e) => setSendLink((s) => (s ? { ...s, message: e.target.value } : s))}
            />
            <p className="text-xs text-muted-foreground">
              O link do Asaas é inserido automaticamente se você removê-lo do texto.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSendLink(null)}>Cancelar</Button>
            <Button variant="outline" onClick={sendLinkEmail}><Mail className="w-4 h-4 mr-2" />E-mail</Button>
            <Button onClick={sendLinkWhatsApp}><MessageCircle className="w-4 h-4 mr-2" />WhatsApp</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir contrato</DialogTitle>
            <DialogDescription>Todas as parcelas serão movidas para o contrato destino e este contrato será excluído.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Contrato destino</Label>
            <Select value={transferTarget} onValueChange={setTransferTarget}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(allContracts ?? []).filter((c: any) => c.id !== id).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.customers?.name} — {c.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button onClick={doTransfer}>Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={legalOpen} onOpenChange={setLegalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar ao Departamento Jurídico</DialogTitle>
            <DialogDescription>Abre um caso jurídico vinculado a este contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Etapa inicial</Label>
              <Select value={legalForm.stage} onValueChange={(v) => setLegalForm({ ...legalForm, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="notificacao_extrajudicial">Notificação extrajudicial</SelectItem>
                  <SelectItem value="protesto">Protesto</SelectItem>
                  <SelectItem value="acao_judicial">Ação judicial</SelectItem>
                  <SelectItem value="acordo">Acordo em negociação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Advogado responsável</Label><Input value={legalForm.attorney_name} onChange={(e) => setLegalForm({ ...legalForm, attorney_name: e.target.value })} /></div>
            <div><Label>Honorários (R$)</Label><Input type="number" step="0.01" value={legalForm.honorary_amount} onChange={(e) => setLegalForm({ ...legalForm, honorary_amount: e.target.value })} /></div>
            <div><Label>Observações</Label><Input value={legalForm.notes} onChange={(e) => setLegalForm({ ...legalForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLegalOpen(false)}>Cancelar</Button>
            <Button onClick={sendToLegal}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}