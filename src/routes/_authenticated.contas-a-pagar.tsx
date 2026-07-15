import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { brl, fmtDate } from "@/lib/format";
import { Download, Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contas-a-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar" }] }),
  component: ContasAPagarPage,
});

type Payable = {
  id: string;
  description: string;
  category: string | null;
  supplier: string | null;
  sector: string | null;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: "pendente" | "paga" | "atrasada" | "cancelada";
  notes: string | null;
  contract_id: string | null;
};

const emptyForm = {
  description: "",
  category: "",
  supplier: "",
  sector: "",
  amount: "",
  due_date: "",
  paid_at: "",
  status: "pendente" as Payable["status"],
  notes: "",
  contract_id: "" as string,
};

function ContasAPagarPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | Payable["status"]>("todos");
  const [sectorFilter, setSectorFilter] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Payable | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: rows } = useQuery({
    queryKey: ["payables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payables")
        .select("id,description,category,supplier,sector,amount,due_date,paid_at,status,notes,contract_id")
        .order("due_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payable[];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["contracts-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id,contract_number,description")
        .order("contract_number", { ascending: true });
      return data ?? [];
    },
  });

  const sectors = useMemo(() => {
    const s = new Set<string>();
    (rows ?? []).forEach((r) => r.sector && s.add(r.sector));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (statusFilter !== "todos" && r.status !== statusFilter) return false;
      if (sectorFilter !== "todos" && r.sector !== sectorFilter) return false;
      if (q) {
        const t = q.toLowerCase();
        if (
          !(
            r.description?.toLowerCase().includes(t) ||
            r.supplier?.toLowerCase().includes(t) ||
            r.category?.toLowerCase().includes(t) ||
            r.sector?.toLowerCase().includes(t)
          )
        )
          return false;
      }
      return true;
    });
  }, [rows, q, statusFilter, sectorFilter]);

  const totals = filtered.reduce(
    (acc, r) => {
      const v = Number(r.amount);
      acc.total += v;
      if (r.status === "paga") acc.pago += v;
      else if (r.status === "atrasada") acc.atrasado += v;
      else if (r.status === "pendente") acc.pendente += v;
      return acc;
    },
    { total: 0, pago: 0, pendente: 0, atrasado: 0 },
  );

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(r: Payable) {
    setEditing(r);
    setForm({
      description: r.description,
      category: r.category ?? "",
      supplier: r.supplier ?? "",
      sector: r.sector ?? "",
      amount: String(r.amount),
      due_date: r.due_date,
      paid_at: r.paid_at ?? "",
      status: r.status,
      notes: r.notes ?? "",
      contract_id: r.contract_id ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const valor = Number(String(form.amount).replace(",", "."));
    if (!form.description.trim()) return toast.error("Informe a descrição");
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Valor inválido");
    if (!form.due_date) return toast.error("Informe o vencimento");
    const payload: any = {
      description: form.description.trim(),
      category: form.category || null,
      supplier: form.supplier || null,
      sector: form.sector || null,
      amount: valor,
      due_date: form.due_date,
      paid_at: form.paid_at || null,
      status: form.paid_at ? "paga" : form.status,
      notes: form.notes || null,
      contract_id: form.contract_id || null,
    };
    const { error } = editing
      ? await supabase.from("payables").update(payload).eq("id", editing.id)
      : await supabase.from("payables").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Lançamento atualizado" : "Lançamento criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["payables"] });
  }

  async function remove(r: Payable) {
    if (!confirm(`Excluir "${r.description}"?`)) return;
    const { error } = await supabase.from("payables").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Lançamento excluído");
    qc.invalidateQueries({ queryKey: ["payables"] });
  }

  async function markPaid(r: Payable) {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("payables")
      .update({ paid_at: today, status: "paga" })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Marcado como pago");
    qc.invalidateQueries({ queryKey: ["payables"] });
  }

  function exportCsv() {
    const header = ["Descrição", "Categoria", "Fornecedor", "Setor", "Valor", "Vencimento", "Pagamento", "Status"];
    const lines = [header.join(";")];
    filtered.forEach((r) => {
      lines.push(
        [
          r.description,
          r.category ?? "",
          r.supplier ?? "",
          r.sector ?? "",
          Number(r.amount).toFixed(2).replace(".", ","),
          fmtDate(r.due_date),
          r.paid_at ? fmtDate(r.paid_at) : "",
          r.status,
        ]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(";"),
      );
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas-a-pagar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusBadge = (s: Payable["status"]) => {
    const map: Record<string, { label: string; variant: any }> = {
      paga: { label: "Paga", variant: "default" },
      pendente: { label: "Pendente", variant: "secondary" },
      atrasada: { label: "Atrasada", variant: "destructive" },
      cancelada: { label: "Cancelada", variant: "outline" },
    };
    return map[s] ?? { label: s, variant: "secondary" };
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground mt-1">
            Contrapartida dos contratos — comissões, taxas, laboratório e despesas gerais.
          </p>
        </div>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Novo lançamento
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{brl(totals.total)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pago</p><p className="text-xl font-bold text-emerald-600">{brl(totals.pago)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pendente</p><p className="text-xl font-bold text-amber-600">{brl(totals.pendente)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Atrasado</p><p className="text-xl font-bold text-destructive">{brl(totals.atrasado)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Buscar por descrição, fornecedor, categoria, setor..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="atrasada">Atrasada</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos setores</SelectItem>
                {sectors.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Exportar CSV</Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const b = statusBadge(r.status);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.description}</TableCell>
                    <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
                    <TableCell>{r.supplier ?? "—"}</TableCell>
                    <TableCell>{r.sector ?? "—"}</TableCell>
                    <TableCell>{fmtDate(r.due_date)}</TableCell>
                    <TableCell>{r.paid_at ? fmtDate(r.paid_at) : "—"}</TableCell>
                    <TableCell>{brl(r.amount)}</TableCell>
                    <TableCell><Badge variant={b.variant}>{b.label}</Badge></TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status !== "paga" && (
                            <Button size="sm" variant="ghost" onClick={() => markPaid(r)}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Pagar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum lançamento.</p>}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
            <DialogDescription>Cadastre a contrapartida referente ao contrato.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Descrição *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="VENDAS, TAXA, LABORATORIO..." />
            </div>
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Setor</Label>
              <Input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Vencimento *</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Pagamento</Label>
              <Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="atrasada">Atrasada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Contrato vinculado (opcional)</Label>
              <Select value={form.contract_id || "none"} onValueChange={(v) => setForm({ ...form, contract_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(contracts ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.contract_number} — {c.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}