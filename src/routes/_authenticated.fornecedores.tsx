import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({ meta: [{ title: "Fornecedores" }] }),
  component: FornecedoresPage,
});

type Supplier = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  category: string | null;
  contact_name: string | null;
  notes: string | null;
  active: boolean;
};

const emptyForm = {
  name: "",
  document: "",
  email: "",
  phone: "",
  address: "",
  category: "",
  contact_name: "",
  notes: "",
  active: true,
};

function FornecedoresPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: rows } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name,document,email,phone,address,category,contact_name,notes,active")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const filtered = useMemo(() => {
    if (!q) return rows ?? [];
    const t = q.toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        r.name?.toLowerCase().includes(t) ||
        r.document?.toLowerCase().includes(t) ||
        r.email?.toLowerCase().includes(t) ||
        r.category?.toLowerCase().includes(t) ||
        r.contact_name?.toLowerCase().includes(t),
    );
  }, [rows, q]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(r: Supplier) {
    setEditing(r);
    setForm({
      name: r.name,
      document: r.document ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
      category: r.category ?? "",
      contact_name: r.contact_name ?? "",
      notes: r.notes ?? "",
      active: r.active,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Informe o nome");
    const payload = {
      name: form.name.trim(),
      document: form.document || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      category: form.category || null,
      contact_name: form.contact_name || null,
      notes: form.notes || null,
      active: form.active,
    };
    const { error } = editing
      ? await supabase.from("suppliers").update(payload).eq("id", editing.id)
      : await supabase.from("suppliers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Fornecedor atualizado" : "Fornecedor criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["suppliers-simple"] });
  }

  async function remove(r: Supplier) {
    if (!confirm(`Excluir "${r.name}"?`)) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Fornecedor excluído");
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["suppliers-simple"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Fornecedores</h1>
          <p className="text-muted-foreground mt-1">
            Cadastro central de fornecedores para vincular às contas a pagar.
          </p>
        </div>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Novo fornecedor
          </Button>
        )}
      </header>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Input
            placeholder="Buscar por nome, documento, e-mail, categoria..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-md"
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.document ?? "—"}</TableCell>
                  <TableCell>{r.category ?? "—"}</TableCell>
                  <TableCell>{r.contact_name ?? "—"}</TableCell>
                  <TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell>{r.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.active ? "default" : "outline"}>
                      {r.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
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
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhum fornecedor.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
            <DialogDescription>Dados cadastrais do fornecedor.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>CNPJ / CPF</Label>
              <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="LABORATORIO, TAXAS..." />
            </div>
            <div className="space-y-1">
              <Label>Nome do contato</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Ativo</Label>
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