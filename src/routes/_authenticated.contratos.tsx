import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate } from "@/lib/format";
import { generateInstallments } from "@/lib/installments";

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({ meta: [{ title: "Contratos | Stillo Foto" }] }),
  component: ContratosPage,
});

function ContratosPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    description: "",
    total_amount: "",
    installments_count: "12",
    first_due_date: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10),
    vendor_id: "none",
    contract_number: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ description: "", first_due_date: "", vendor_id: "none" });
  const [editOrigDue, setEditOrigDue] = useState("");

  const { data: customers } = useQuery({
    queryKey: ["customers-light"],
    queryFn: async () => (await supabase.from("customers").select("id,name,contract_number").order("name")).data ?? [],
  });

  const { data: vendors } = useQuery({
    queryKey: ["vendors-light"],
    queryFn: async () => ((await (supabase as any).from("vendors").select("id,name,commission_rate").eq("active", true).order("name")).data ?? []) as { id: string; name: string; commission_rate: number }[],
  });

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("*, customers(name), installments(amount,paid_at,due_date)")
        .neq("legal_status", "juridico")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function save() {
    const total = parseFloat(form.total_amount);
    const count = parseInt(form.installments_count, 10);
    if (!form.customer_id) return toast.error("Selecione um cliente");
    if (!form.description.trim()) return toast.error("Informe a descrição");
    if (!total || total <= 0) return toast.error("Valor total inválido");
    if (!count || count <= 0) return toast.error("Número de parcelas inválido");

    const { data: contract, error } = await supabase.from("contracts").insert({
      customer_id: form.customer_id,
      description: form.description.trim(),
      total_amount: total,
      installments_count: count,
      first_due_date: form.first_due_date,
      contract_number: form.contract_number?.trim() || null,
      ...(form.vendor_id && form.vendor_id !== "none" ? { vendor_id: form.vendor_id } : {}),
    } as any).select().single();
    if (error || !contract) return toast.error(error?.message ?? "Erro ao criar contrato");

    const installments = generateInstallments(total, count, form.first_due_date).map((p) => ({
      ...p,
      contract_id: contract.id,
    }));
    const { error: e2 } = await supabase.from("installments").insert(installments);
    if (e2) return toast.error(e2.message);
    toast.success(`Contrato criado com ${count} parcelas`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["contracts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  function openEdit(c: any, ev: React.MouseEvent) {
    ev.stopPropagation();
    setEditingId(c.id);
    setEditForm({ description: c.description ?? "", first_due_date: c.first_due_date, vendor_id: c.vendor_id ?? "none" });
    setEditOrigDue(c.first_due_date);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editForm.description.trim()) return toast.error("Informe a descrição");
    const { error } = await supabase.from("contracts").update({
      description: editForm.description.trim(),
      first_due_date: editForm.first_due_date,
      vendor_id: editForm.vendor_id === "none" ? null : editForm.vendor_id,
    }).eq("id", editingId);
    if (error) return toast.error(error.message);

    // Shift unpaid installments' due dates by the same day diff, if first_due changed
    if (editForm.first_due_date !== editOrigDue) {
      const diff = Math.round(
        (new Date(editForm.first_due_date + "T00:00:00").getTime() -
          new Date(editOrigDue + "T00:00:00").getTime()) / 86400000,
      );
      if (diff !== 0) {
        const { data: ins } = await supabase
          .from("installments")
          .select("id,due_date,paid_at")
          .eq("contract_id", editingId);
        const updates = (ins ?? [])
          .filter((i) => !i.paid_at)
          .map((i) => {
            const d = new Date(i.due_date + "T00:00:00");
            d.setDate(d.getDate() + diff);
            return supabase
              .from("installments")
              .update({ due_date: d.toISOString().slice(0, 10) })
              .eq("id", i.id);
          });
        await Promise.all(updates);
      }
    }

    toast.success("Contrato atualizado");
    setEditOpen(false);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["contracts"] });
  }

  function statusOf(c: any) {
    const today = new Date(); today.setHours(0,0,0,0);
    let paid = 0, overdue = 0;
    (c.installments ?? []).forEach((i: any) => {
      if (i.paid_at) paid++;
      else if (new Date(i.due_date + "T00:00:00") < today) overdue++;
    });
    const total = c.installments?.length ?? c.installments_count;
    return { paid, overdue, total };
  }

  const filteredContracts = (contracts ?? []).filter((c: any) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      c.customers?.name?.toLowerCase().includes(t) ||
      c.description?.toLowerCase().includes(t) ||
      c.contract_number?.toLowerCase().includes(t)
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contratos</h1>
          <p className="text-muted-foreground mt-1">
            {filteredContracts.length} de {contracts?.length ?? 0} contratos
          </p>
        </div>
        <div className="flex gap-2">
        {canEdit && (
          <Button variant="outline" onClick={async () => {
            const { data, error } = await (supabase as any).rpc("backfill_contract_numbers");
            if (error) return toast.error(error.message);
            toast.success(`Varredura concluída: ${data ?? 0} contrato(s) atualizado(s).`);
            qc.invalidateQueries({ queryKey: ["contracts"] });
          }}>Varredura Nº contrato</Button>
        )}
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Novo contrato</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo contrato</DialogTitle>
                <DialogDescription>As parcelas serão geradas automaticamente.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Cliente *</Label>
                  <Select value={form.customer_id} onValueChange={(v) => {
                    const c = (customers as any[] | undefined)?.find((x) => x.id === v);
                    setForm({ ...form, customer_id: v, contract_number: c?.contract_number ?? form.contract_number });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Descrição *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Curso de inglês" /></div>
                <div><Label>Nº do contrato</Label><Input value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })} placeholder="Preenchido automaticamente a partir do cliente" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Valor total (R$) *</Label><Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} /></div>
                  <div><Label>Nº parcelas *</Label><Input type="number" min="1" value={form.installments_count} onChange={(e) => setForm({ ...form, installments_count: e.target.value })} /></div>
                </div>
                <div><Label>1ª data de vencimento *</Label><Input type="date" value={form.first_due_date} onChange={(e) => setForm({ ...form, first_due_date: e.target.value })} /></div>
                <div>
                  <Label>Vendedor (comissão)</Label>
                  <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Sem vendedor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem vendedor</SelectItem>
                      {vendors?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name} — {Number(v.commission_rate).toFixed(2)}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={save}>Criar contrato</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </header>

      <Card><CardContent className="pt-6">
        <div className="mb-4">
          <Input
            placeholder="Buscar por cliente, nº do contrato ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p>
         : !contracts?.length ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhum contrato cadastrado.</p>
         : !filteredContracts.length ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhum contrato encontrado para "{search}".</p>
         : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>1º Venc.</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContracts.map((c: any) => {
                const s = statusOf(c);
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => { window.location.href = `/contratos/${c.id}`; }}
                  >
                    <TableCell className="font-medium">{c.customers?.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.contract_number || "—"}</TableCell>
                    <TableCell>{c.description}</TableCell>
                    <TableCell>{brl(c.total_amount)}</TableCell>
                    <TableCell>{fmtDate(c.first_due_date)}</TableCell>
                    <TableCell>
                      <span className="text-sm">
                        <span className="text-emerald-600 font-medium">{s.paid}</span>
                        {" / "}
                        <span>{s.total}</span>
                        {s.overdue > 0 && <span className="text-destructive ml-2">({s.overdue} atraso)</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <Button size="icon" variant="ghost" onClick={(e) => openEdit(c, e)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground inline" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
         )}
      </CardContent></Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar contrato</DialogTitle>
            <DialogDescription>
              Alterar a 1ª data de vencimento desloca as parcelas em aberto pela mesma diferença.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descrição *</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div>
              <Label>1ª data de vencimento</Label>
              <Input type="date" value={editForm.first_due_date} onChange={(e) => setEditForm({ ...editForm, first_due_date: e.target.value })} />
            </div>
            <div>
              <Label>Vendedor (comissão)</Label>
              <Select value={editForm.vendor_id} onValueChange={(v) => setEditForm({ ...editForm, vendor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sem vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vendedor</SelectItem>
                  {vendors?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name} — {Number(v.commission_rate).toFixed(2)}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={saveEdit}>Atualizar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}