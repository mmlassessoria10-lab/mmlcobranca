import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({ meta: [{ title: "Comissões | Stillo Foto" }] }),
  component: ComissoesPage,
});

type Vendor = {
  id: string;
  name: string;
  commission_rate: number;
  active: boolean;
  notes: string | null;
};

type Commission = {
  id: string;
  vendor_id: string;
  contract_id: string;
  installment_id: string;
  installment_amount: number;
  rate: number;
  amount: number;
  status: "pendente" | "pago";
  paid_at: string | null;
  created_at: string;
};

function ComissoesPage() {
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Comissões</h1>
        <p className="text-muted-foreground mt-1">
          Vendedores e apuração de comissões por parcela recebida.
        </p>
      </header>
      <Tabs defaultValue="commissions">
        <TabsList>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="vendors">Vendedores</TabsTrigger>
        </TabsList>
        <TabsContent value="commissions" className="mt-4">
          <CommissionsTab canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="vendors" className="mt-4">
          <VendorsTab canEdit={canEdit} canDelete={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VendorsTab({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", commission_rate: "10", active: true, notes: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vendors").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });

  function openNew() {
    setEditingId(null);
    setForm({ name: "", commission_rate: "10", active: true, notes: "" });
    setOpen(true);
  }
  function openEdit(v: Vendor) {
    setEditingId(v.id);
    setForm({
      name: v.name,
      commission_rate: String(v.commission_rate),
      active: v.active,
      notes: v.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Informe o nome do vendedor");
    const rate = parseFloat(form.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) return toast.error("Taxa deve estar entre 0 e 100");
    const payload = {
      name: form.name.trim(),
      commission_rate: rate,
      active: form.active,
      notes: form.notes || null,
    };
    const { error } = editingId
      ? await (supabase as any).from("vendors").update(payload).eq("id", editingId)
      : await (supabase as any).from("vendors").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Vendedor atualizado" : "Vendedor cadastrado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["vendors"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir vendedor? As comissões vinculadas também serão removidas.")) return;
    const { error } = await (supabase as any).from("vendors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vendedor removido");
    qc.invalidateQueries({ queryKey: ["vendors"] });
    qc.invalidateQueries({ queryKey: ["commissions"] });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} vendedor(es)</p>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo vendedor</Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? "Editar vendedor" : "Novo vendedor"}</DialogTitle>
                  <DialogDescription>Defina o percentual de comissão sobre cada parcela recebida.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Comissão (%) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.commission_rate}
                      onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Observações</Label>
                    <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={save}>{editingId ? "Atualizar" : "Salvar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum vendedor cadastrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Observações</TableHead>
                {canEdit && <TableHead className="w-24"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{Number(v.commission_rate).toFixed(2)}%</TableCell>
                  <TableCell>
                    <Badge variant={v.active ? "default" : "outline"}>
                      {v.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{v.notes || "—"}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(v)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {canDelete && (
                        <Button size="icon" variant="ghost" onClick={() => remove(v.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CommissionsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pendente" | "pago">("all");
  const [search, setSearch] = useState("");

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("vendors").select("id,name,commission_rate,active,notes").order("name");
      return (data ?? []) as Vendor[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["commissions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("commissions")
        .select("*, vendors(name), contracts(description, customers(name)), installments(number, due_date, paid_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c: any) => {
      // Somente comissões de parcelas efetivamente recebidas (baixadas como recebida).
      if (!c.installments?.paid_at) return false;
      if (vendorFilter !== "all" && c.vendor_id !== vendorFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          c.vendors?.name,
          c.contracts?.customers?.name,
          c.contracts?.description,
          c.installments?.number != null ? `#${c.installments.number}` : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, vendorFilter, statusFilter, search]);

  const totals = useMemo(() => {
    let pendente = 0, pago = 0;
    for (const c of filtered as Commission[]) {
      if (c.status === "pendente") pendente += Number(c.amount);
      else pago += Number(c.amount);
    }
    return { pendente, pago, total: pendente + pago };
  }, [filtered]);

  async function toggleStatus(c: Commission) {
    const next = c.status === "pago" ? "pendente" : "pago";
    const { error } = await (supabase as any)
      .from("commissions")
      .update({ status: next, paid_at: next === "pago" ? new Date().toISOString() : null })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(next === "pago" ? "Comissão marcada como paga" : "Comissão reaberta");
    qc.invalidateQueries({ queryKey: ["commissions"] });
  }

  async function markManyPaid() {
    const pendings = (filtered as Commission[]).filter((c) => c.status === "pendente");
    if (!pendings.length) return toast.info("Nenhuma comissão pendente no filtro atual");
    if (!confirm(`Marcar ${pendings.length} comissão(ões) como paga(s)?`)) return;
    const ids = pendings.map((c) => c.id);
    const { error } = await (supabase as any)
      .from("commissions")
      .update({ status: "pago", paid_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Comissões acertadas");
    qc.invalidateQueries({ queryKey: ["commissions"] });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase">Pendente</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{brl(totals.pendente)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase">Pago</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{brl(totals.pago)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase">Total apurado</p>
          <p className="text-2xl font-bold mt-1">{brl(totals.total)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="min-w-64 flex-1">
              <Label className="text-xs">Pesquisar</Label>
              <Input
                placeholder="Vendedor, cliente, contrato ou parcela..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="min-w-48">
              <Label className="text-xs">Vendedor</Label>
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {vendors?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-40">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              {canEdit && (
                <Button variant="outline" onClick={markManyPaid}>
                  <Check className="w-4 h-4 mr-2" /> Acertar filtradas
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !filtered.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma comissão para os filtros atuais.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Cliente / Contrato</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Recebido</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.vendors?.name}</TableCell>
                    <TableCell>
                      <div className="text-sm">{c.contracts?.customers?.name}</div>
                      <div className="text-xs text-muted-foreground">{c.contracts?.description}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      #{c.installments?.number} · {fmtDate(c.installments?.paid_at ?? c.installments?.due_date)}
                    </TableCell>
                    <TableCell>{brl(c.installment_amount)}</TableCell>
                    <TableCell>{Number(c.rate).toFixed(2)}%</TableCell>
                    <TableCell className="font-semibold">{brl(c.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "pago" ? "secondary" : "outline"}>
                        {c.status === "pago" ? "Pago" : "Pendente"}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          title={c.status === "pago" ? "Reabrir" : "Marcar como paga"}
                          onClick={() => toggleStatus(c)}
                        >
                          {c.status === "pago" ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}