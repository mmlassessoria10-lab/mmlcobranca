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
import { Copy, MessageCircle, Upload, Trash2 } from "lucide-react";
import { PIX_KEY, PIX_KEY_LABEL, copyPix } from "@/lib/pix";
import { useState } from "react";
import { toast } from "sonner";
import { openWhatsAppComposer } from "@/lib/communication";
import headerAsset from "@/assets/hemanoele-scarpin-logo.png.asset.json";

const ROLES: AppRole[] = ["admin", "financeiro", "cobranca"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administração | Photogenic" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [invRole, setInvRole] = useState<AppRole>("cobranca");
  const [invPhone, setInvPhone] = useState("");
  const [invNote, setInvNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data: agreementLogo } = useQuery({
    queryKey: ["setting", "agreement_logo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value,updated_at")
        .eq("key", "agreement_logo")
        .maybeSingle();
      return data;
    },
  });

  async function onLogoFile(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Envie um arquivo de imagem (PNG, JPG).");
    if (file.size > 500 * 1024) return toast.error("Imagem muito grande. Use até 500 KB (comprima se necessário).");
    setUploadingLogo(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const { error } = await supabase.from("app_settings").upsert({
        key: "agreement_logo",
        value: { url: dataUrl, filename: file.name },
      });
      if (error) throw error;
      toast.success("Logo atualizada");
      qc.invalidateQueries({ queryKey: ["setting", "agreement_logo"] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar imagem");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    if (!confirm("Remover a logo atual? A imagem padrão voltará a ser exibida.")) return;
    const { error } = await supabase.from("app_settings").delete().eq("key", "agreement_logo");
    if (error) return toast.error(error.message);
    toast.success("Logo removida");
    qc.invalidateQueries({ queryKey: ["setting", "agreement_logo"] });
  }

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
  function inviteMessage(token: string, role: AppRole) {
    return `Olá! Você foi convidado para acessar o Photogenic como ${ROLE_LABELS[role]}. Acesse o link para criar sua conta: ${inviteUrl(token)}`;
  }

  async function createInvite() {
    setCreating(true);
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 40);
    const { error } = await supabase.from("invites").insert({
      token,
      role: invRole,
      note: invNote || null,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    setCreating(false);
    if (error) {
      return toast.error(error.message);
    }
    toast.success("Convite gerado");
    setInvNote("");
    qc.invalidateQueries({ queryKey: ["admin-invites"] });
    if (invPhone.trim()) {
      openWhatsAppComposer(invPhone, inviteMessage(token, invRole));
      toast.success("Mensagem copiada. Se o WhatsApp não abrir, cole no contato.");
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
        <CardHeader><CardTitle className="text-base">Chave PIX para recebimentos</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="text-muted-foreground">Tipo: {PIX_KEY_LABEL}</div>
            <div className="font-mono text-base">{PIX_KEY}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Exibida aos clientes em "Minhas Parcelas" ao lado de cada parcela em aberto.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const ok = await copyPix();
              ok ? toast.success("Chave PIX copiada") : toast.error("Não foi possível copiar");
            }}
          >
            <Copy className="w-4 h-4 mr-2" /> Copiar chave PIX
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo do Termo Extrajudicial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta imagem aparece centralizada no topo da página pública do acordo enviado ao cliente. Use PNG com fundo transparente, até 500 KB.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-md border bg-muted/30 p-3 min-w-[220px]">
              {(agreementLogo?.value as any)?.url || headerAsset.url ? (
                <img
                  src={(agreementLogo?.value as any)?.url ?? headerAsset.url}
                  alt="Logo do termo extrajudicial"
                  className="max-h-24 w-auto mx-auto"
                />
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhuma logo enviada — usando a padrão do sistema.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="logo-upload" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
                  <Upload className="w-4 h-4" />
                  {uploadingLogo ? "Enviando..." : "Escolher imagem"}
                </div>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onLogoFile(f);
                    e.target.value = "";
                  }}
                />
              </Label>
              {(agreementLogo?.value as any)?.url && (
                <Button variant="outline" size="sm" onClick={removeLogo}>
                  <Trash2 className="w-4 h-4 mr-2" /> Remover logo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={status !== "pendente" || !invPhone.trim()}
                            onClick={() => {
                              if (!openWhatsAppComposer(invPhone, inviteMessage(inv.token, inv.role as AppRole))) {
                                return toast.error("Informe o telefone acima antes de enviar");
                              }
                              toast.success("Mensagem copiada. Se o WhatsApp não abrir, cole no contato.");
                            }}
                          >
                            <MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp
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