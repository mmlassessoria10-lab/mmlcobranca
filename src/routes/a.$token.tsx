import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ShieldCheck, Loader2, Handshake } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/a/$token")({
  head: () => ({ meta: [{ title: "Acordo Extrajudicial" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PublicAgreement,
});

function brl(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? v + "T00:00:00" : v);
  return d.toLocaleDateString("pt-BR");
}

function PublicAgreement() {
  const { token } = Route.useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/public/agreements/${token}`);
      if (!r.ok) { setData(null); return; }
      setData(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [token]);

  async function accept() {
    if (name.trim().length < 3) return toast.error("Informe seu nome completo");
    if (doc.trim().length < 5) return toast.error("Informe seu CPF/CNPJ");
    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/agreements/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), document: doc.trim() }),
      });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Falha ao registrar aceite");
      toast.success("Acordo aceito com sucesso");
      load();
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!data) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold mb-2">Acordo não encontrado</h1><p className="text-muted-foreground text-sm">O link pode ter expirado ou é inválido.</p></div></div>;

  const accepted = !!data.accepted_at;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Handshake className="w-5 h-5" /> {data.subject || "Acordo Extrajudicial"}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Proposta em {new Date(data.created_at).toLocaleString("pt-BR")}
              {data.customers?.name ? ` · ${data.customers.name}` : ""}
              {data.contracts?.contract_number ? ` · Contrato Nº ${data.contracts.contract_number}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Débito atualizado</p><p className="font-semibold text-amber-600">{brl(data.updated_amount)}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Entrada</p><p className="font-semibold">{brl(data.entry_amount)}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Parcelas</p><p className="font-semibold">{data.installments_count}× {brl(data.installment_amount)}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">1º vencimento</p><p className="font-semibold">{fmtDate(data.first_due_date)}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Total do acordo</p><p className="font-semibold">{brl(data.total_amount)}</p></div>
            </div>
            <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed border rounded p-4 bg-background max-h-[50vh] overflow-auto">{data.body}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Aceite por assinatura digital</CardTitle></CardHeader>
          <CardContent>
            {accepted ? (
              <div className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">Acordo aceito</p>
                  <p className="text-muted-foreground">Por <b>{data.accepted_name}</b> ({data.accepted_document}) em {new Date(data.accepted_at).toLocaleString("pt-BR")}.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Ao aceitar, você concorda com as condições do acordo acima. Nome, documento, data/hora, IP e navegador serão armazenados como comprovação.</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
                  <div><Label>CPF/CNPJ</Label><Input value={doc} onChange={(e) => setDoc(e.target.value)} maxLength={40} /></div>
                </div>
                <Button onClick={accept} disabled={submitting} className="w-full md:w-auto">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Aceitar acordo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}