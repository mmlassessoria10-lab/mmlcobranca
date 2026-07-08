import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ROLES: AppRole[] = ["admin", "financeiro", "cobranca"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administração | ParcelaPro" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [invRole, setInvRole] = useState<AppRole>("cobranca");
  const [invPhone, setInvPhone] = useState("");
  const [invNote, setInvNote] = useState("");
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name,created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const map: Record<string, AppRole[]> = {};
      (roles ?? []).forEach((r: any) => {
        (map[r.user_id] ??= []).push(r.role);
      });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: map[p.id] ?? [] }));
    },
  });

  const { data: invites } = useQuery({
    queryKey: ["admin-invites"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("invites")
        .select("id,token,role,note,expires_at,used_at,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  function inviteUrl(token: string) {
    return `${window.location.origin}/auth?invite=${token}`;
  }
  function waLink(token: string, phone: string, role: AppRole) {
    const p = phone.replace(/\D/g, "");
    const num = p.length === 11 ? "55" + p : p;
    const msg =
      `Olá! Você foi convidado para acessar o ParcelaPro como ${ROLE_LABELS[role]}. ` +
      `Acesse o link para criar sua conta: ${inviteUrl(token)}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  async function createInvite() {
    setCreating(true);
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 40);
    // Abre a janela do WhatsApp SINCRONAMENTE (antes de qualquer await),
    // caso contrário o navegador bloqueia como popup.
    let waWindow: Window | null = null;
    if (invPhone.trim()) {
      waWindow = window.open("about:blank", "_blank", "noopener");
    }
    const { error } = await supabase.from("invites").insert({
      token,
      role: invRole,
      note: invNote || null,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    setCreating(false);
    if (error) {
      waWindow?.close();
      return toast.error(error.message);
    }
    toast.success("Convite gerado");
    setInvNote("");
    qc.invalidateQueries({ queryKey: ["admin-invites"] });
    if (waWindow) {
      waWindow.location.href = waLink(token, invPhone, invRole);
    } else if (invPhone.trim()) {
      // fallback: navega na aba atual se o popup foi bloqueado
      window.location.href = waLink(token, invPhone, invRole);
    }
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success("Link copiado");
  }

  async function toggleRole(userId: string, role: AppRole, has: boolean) {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
    }
    toast.success("Papel atualizado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  if (!isAdmin) {
    return (
      <Card><CardContent className="pt-6">
        <p className="text-muted-foreground">Apenas administradores têm acesso a esta página.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Administração</h1>
        <p className="text-muted-foreground mt-1">Gerencie usuários e atribua papéis (Admin, Financeiro, Cobrança).</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Usuários ({data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  {ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABELS[r]}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                    <TableCell>
                      {u.email}
                      {u.roles.length === 0 && <Badge variant="outline" className="ml-2">sem papel</Badge>}
                    </TableCell>
                    {ROLES.map((r) => {
                      const has = u.roles.includes(r);
                      return (
                        <TableCell key={r} className="text-center">
                          <Checkbox checked={has} onCheckedChange={() => toggleRole(u.id, r, has)} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Convidar novo usuário</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={invRole} onValueChange={(v) => setInvRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>WhatsApp (opcional)</Label>
              <Input placeholder="(11) 91234-5678" value={invPhone} onChange={(e) => setInvPhone(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Observação (opcional)</Label>
              <Input placeholder="Ex: convite para João" value={invNote} onChange={(e) => setInvNote(e.target.value)} />
            </div>
          </div>
          <Button onClick={createInvite} disabled={creating}>
            {creating ? "Gerando..." : "Gerar convite"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Se um número de WhatsApp for informado, o link será aberto no WhatsApp após a criação. Convites expiram em 7 dias.
          </p>

          {invites && invites.length > 0 && (
            <div className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Papel</TableHead>
                    <TableHead>Observação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv: any) => {
                    const expired = new Date(inv.expires_at) < new Date();
                    const status = inv.used_at ? "usado" : expired ? "expirado" : "pendente";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>{ROLE_LABELS[inv.role as AppRole]}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{inv.note ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={status === "pendente" ? "default" : "outline"}>{status}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)} disabled={status !== "pendente"}>
                            <Copy className="w-3.5 h-3.5 mr-1" />Link
                          </Button>
                          <Button size="sm" variant="outline" asChild disabled={status !== "pendente"}>
                            <a
                              href={waLink(inv.token, invPhone || "", inv.role as AppRole)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sobre os papéis</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Administrador:</strong> acesso total, gerencia usuários e exclui registros.</p>
          <p><strong className="text-foreground">Financeiro:</strong> cria/edita clientes e contratos, marca parcelas como pagas, importa Excel.</p>
          <p><strong className="text-foreground">Cobrança:</strong> visualiza contratos e envia lembretes (e-mail e WhatsApp).</p>
        </CardContent>
      </Card>
    </div>
  );
}