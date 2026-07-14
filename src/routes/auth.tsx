import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import photogenicLogo from "@/assets/dedubiani-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar | Stillo Foto" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const urlInviteToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("invite")
      : null;

  // Persist invite so it survives email confirmation / page reloads
  if (typeof window !== "undefined" && urlInviteToken) {
    try { localStorage.setItem("pending_invite", urlInviteToken); } catch {}
  }
  const inviteToken =
    urlInviteToken ||
    (typeof window !== "undefined" ? localStorage.getItem("pending_invite") : null);

  async function tryRedeemInvite(): Promise<boolean> {
    if (!inviteToken) return false;
    const { data, error } = await supabase.rpc("redeem_invite", { _token: inviteToken });
    if (error) {
      toast.error("Convite: " + error.message);
      // Token inválido/expirado/usado — não tentar de novo
      try { localStorage.removeItem("pending_invite"); } catch {}
      return false;
    }
    if (data) {
      toast.success(`Papel "${data}" atribuído pelo convite.`);
      try { localStorage.removeItem("pending_invite"); } catch {}
      return true;
    }
    return false;
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    const redeemed = await tryRedeemInvite();
    toast.success("Bem-vindo!");
    if (redeemed) {
      // Recarrega para que o AuthProvider releia os papéis atribuídos
      window.location.assign("/");
    } else {
      navigate({ to: "/" });
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      const redeemed = await tryRedeemInvite();
      toast.success("Conta criada!");
      if (redeemed) {
        window.location.assign("/");
      } else {
        navigate({ to: "/" });
      }
    } else {
      toast.success("Conta criada! Confirme seu e-mail e entre para ativar o convite.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <img
            src={photogenicLogo.url}
            alt="MML Assessoria & Cobrança"
            className="w-40 h-40 object-contain"
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Controle de Parcelamento</CardTitle>
            <CardDescription>Entre na sua conta ou crie uma nova.</CardDescription>
            {inviteToken && (
              <p className="text-xs text-primary mt-2">
                Você foi convidado. Entre ou crie sua conta para aceitar o convite.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="e1">E-mail</Label>
                    <Input id="e1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p1">Senha</Label>
                    <Input id="p1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="n2">Nome completo</Label>
                    <Input id="n2" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="e2">E-mail</Label>
                    <Input id="e2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p2">Senha (mín. 6 caracteres)</Label>
                    <Input id="p2" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Criando..." : "Criar conta"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    O primeiro usuário cadastrado se torna Administrador automaticamente.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}