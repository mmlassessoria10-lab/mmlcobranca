import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Mail, Phone, Trash2, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { openWhatsAppComposer } from "@/lib/communication";
import { maskDocument, maskPhone, unmask } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes | Stillo Foto" }] }),
  component: ClientesPage,
});

function ClientesPage() {
  const qc = useQueryClient();
  const { hasRole, isAdmin } = useAuth();
  const canEdit = isAdmin || hasRole("financeiro") || hasRole("cobranca");
  const canDelete = isAdmin;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const emptyForm = {
    name: "", document: "", email: "", phone: "", contract_number: "", notes: "",
    address_street: "", address_number: "", address_complement: "",
    address_neighborhood: "", address_city: "", address_state: "", address_zip: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accessFor, setAccessFor] = useState<any | null>(null);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(c: any) {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      document: c.document ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      contract_number: c.contract_number ?? "",
      notes: c.notes ?? "",
      address_street: (c as any).address_street ?? "",
      address_number: (c as any).address_number ?? "",
      address_complement: (c as any).address_complement ?? "",
      address_neighborhood: (c as any).address_neighborhood ?? "",
      address_city: (c as any).address_city ?? "",
      address_state: (c as any).address_state ?? "",
      address_zip: (c as any).address_zip ?? "",
    });
    setOpen(true);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  async function save() {
    if (!form.name.trim()) return toast.error("Nome é obrigatório");
    const payload = {
      name: form.name.trim(),
      document: unmask(form.document) || null,
      email: form.email || null,
      phone: unmask(form.phone) || null,
      contract_number: form.contract_number?.trim() || null,
      notes: form.notes || null,
      address_street: form.address_street?.trim() || null,
      address_number: form.address_number?.trim() || null,
      address_complement: form.address_complement?.trim() || null,
      address_neighborhood: form.address_neighborhood?.trim() || null,
      address_city: form.address_city?.trim() || null,
      address_state: form.address_state?.trim().toUpperCase() || null,
      address_zip: unmask(form.address_zip) || null,
    } as any;
    const { error } = editingId
      ? await supabase.from("customers").update(payload).eq("id", editingId)
      : await supabase.from("customers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Cliente atualizado" : "Cliente cadastrado");
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir cliente? Os contratos vinculados também serão removidos.")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cliente removido");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  const filtered = (data ?? []).filter((c) =>
    [c.name, c.document, c.email, c.phone, (c as any).contract_number].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
  );

  const authUrl = typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth";
  function accessMessage(c: any) {
    return (
      `Olá, ${c?.name ?? ""}!\n\n` +
      `Você já pode acompanhar seus parcelamentos no Stillo Foto.\n\n` +
      `1) Acesse: ${authUrl}\n` +
      `2) Clique em "Criar conta" usando este e-mail: ${c?.email ?? ""}\n` +
      `3) Defina uma senha e pronto — você verá suas parcelas em "Minhas Parcelas".`
    );
  }
  function onlyDigits(s: string) { return (s || "").replace(/\D/g, ""); }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground mt-1">{data?.length ?? 0} clientes cadastrados</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Novo cliente</Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar cliente" : "Novo cliente"}</DialogTitle>
                <DialogDescription>Dados básicos do cliente.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                <div><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>CPF/CNPJ</Label><Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="11999999999" /></div>
                </div>
                <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Nº do contrato (auxiliar)</Label><Input value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })} placeholder="Ex: 2024-0123" /></div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-semibold mb-2">Endereço</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2"><Label>Logradouro</Label><Input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} placeholder="Rua, Av..." /></div>
                    <div><Label>Número</Label><Input value={form.address_number} onChange={(e) => setForm({ ...form, address_number: e.target.value })} placeholder="123" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div><Label>Complemento</Label><Input value={form.address_complement} onChange={(e) => setForm({ ...form, address_complement: e.target.value })} placeholder="Apto, Sala..." /></div>
                    <div><Label>Bairro</Label><Input value={form.address_neighborhood} onChange={(e) => setForm({ ...form, address_neighborhood: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-6 gap-3 mt-3">
                    <div className="col-span-3"><Label>Cidade</Label><Input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} /></div>
                    <div className="col-span-1"><Label>UF</Label><Input maxLength={2} value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value.toUpperCase() })} placeholder="MT" /></div>
                    <div className="col-span-2"><Label>CEP</Label><Input value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} placeholder="78000-000" /></div>
                  </div>
                </div>
                <div><Label>Observações</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>{editingId ? "Atualizar" : "Salvar"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <Card>
        <CardContent className="pt-6">
          <Input placeholder="Buscar por nome, documento, e-mail ou telefone" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4" />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Nº contrato</TableHead>
                  <TableHead>Contato</TableHead>
                  {canEdit && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.document || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{(c as any).contract_number || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                        {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Enviar acesso ao cliente"
                          onClick={() => {
                            if (!c.email) return toast.error("Cadastre um e-mail para o cliente antes de enviar o acesso.");
                            setAccessFor(c);
                          }}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {canDelete && (
                          <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
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

      <Dialog open={!!accessFor} onOpenChange={(o) => !o && setAccessFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar acesso ao cliente</DialogTitle>
            <DialogDescription>
              O cliente cria a conta em <b>/auth</b> com o e-mail cadastrado e passa a ver apenas os próprios parcelamentos.
            </DialogDescription>
          </DialogHeader>
          {accessFor && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/40 p-3 whitespace-pre-wrap font-mono text-xs">
                {accessMessage(accessFor)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(accessMessage(accessFor));
                    toast.success("Mensagem copiada");
                  }}
                >
                  Copiar mensagem
                </Button>
                {accessFor.phone && (
                  <Button
                    onClick={() => {
                      openWhatsAppComposer(accessFor.phone, accessMessage(accessFor));
                      toast.success("Mensagem copiada. Se o WhatsApp não abrir, cole no contato.");
                    }}
                  >
                    <Phone className="w-4 h-4 mr-2" /> Enviar por WhatsApp
                  </Button>
                )}
                {accessFor.email && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const subject = "Seu acesso ao Stillo Foto";
                      window.location.href = `mailto:${accessFor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(accessMessage(accessFor))}`;
                    }}
                  >
                    <Mail className="w-4 h-4 mr-2" /> Enviar por e-mail
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccessFor(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}