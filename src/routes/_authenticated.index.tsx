import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/format";
import { AlertTriangle, CheckCircle2, Clock, DollarSign, FileText, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import photogenicLogo from "@/assets/mml-logo.jpeg.asset.json";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard | Stillo Foto" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [{ data: installments }, { data: contracts }, { data: customers }] = await Promise.all([
        supabase
          .from("installments")
          .select("amount,status,due_date,paid_at,contracts!inner(legal_status)")
          .not("contracts.legal_status", "eq", "juridico"),
        supabase.from("contracts").select("id,total_amount").neq("legal_status", "juridico"),
        supabase.from("customers").select("id"),
      ]);
      const today = new Date(); today.setHours(0,0,0,0);
      let total = 0, pago = 0, aberto = 0, atrasado = 0, qtdAtraso = 0;
      (installments ?? []).forEach((i: any) => {
        const amt = Number(i.amount);
        total += amt;
        if (i.paid_at) { pago += amt; return; }
        aberto += amt;
        const d = new Date(i.due_date + "T00:00:00");
        if (d < today) { atrasado += amt; qtdAtraso += 1; }
      });
      return {
        total, pago, aberto, atrasado, qtdAtraso,
        contratos: contracts?.length ?? 0,
        clientes: customers?.length ?? 0,
      };
    },
  });

  const { data: overdueList } = useQuery({
    queryKey: ["overdue-top"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("installments")
        .select("id,number,due_date,amount,contracts!inner(id,description,legal_status,customers(name))")
        .not("contracts.legal_status", "eq", "juridico")
        .is("paid_at", null)
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(8);
      return data ?? [];
    },
  });

  const { data: juridico } = useQuery({
    queryKey: ["dashboard-juridico"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id,installments(amount,paid_at)")
        .eq("legal_status", "juridico");
      let aReceber = 0, recebido = 0;
      (data ?? []).forEach((c: any) => {
        (c.installments ?? []).forEach((i: any) => {
          const amt = Number(i.amount);
          if (i.paid_at) recebido += amt;
          else aReceber += amt;
        });
      });
      return { qtd: data?.length ?? 0, aReceber, recebido };
    },
  });

  const totalBase = data?.total ?? 0;
  const pct = (v: number) => (totalBase > 0 ? `${((v / totalBase) * 100).toFixed(1)}%` : "—");
  const kpis = [
    { label: "Total contratado", value: brl(data?.total ?? 0), pct: totalBase > 0 ? "100%" : "—", icon: DollarSign, color: "text-primary" },
    { label: "Pago", value: brl(data?.pago ?? 0), pct: pct(data?.pago ?? 0), icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Em aberto", value: brl(data?.aberto ?? 0), pct: pct(data?.aberto ?? 0), icon: Clock, color: "text-amber-600" },
    { label: "Em atraso", value: brl(data?.atrasado ?? 0), pct: pct(data?.atrasado ?? 0), icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <img
          src={photogenicLogo.url}
          alt="MML Assessoria & Cobrança"
          className="w-48 h-48 object-contain shrink-0"
        />
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visão geral do parcelamento</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold mt-1">{isLoading ? "—" : k.value}</p>
                  <p className={`text-xs font-medium mt-1 ${k.color}`}>{isLoading ? "—" : `${k.pct} do total`}</p>
                </div>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Clientes</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{data?.clientes ?? 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Contratos</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{data?.contratos ?? 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Parcelas em atraso</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{data?.qtdAtraso ?? 0}</p></CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
          <Scale className="w-4 h-4" /> Departamento Jurídico
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Contratos transferidos</p>
              <p className="text-2xl font-bold mt-1">{juridico?.qtd ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Valor a receber</p>
              <p className="text-2xl font-bold mt-1 text-amber-600">{brl(juridico?.aReceber ?? 0)}</p>
              <p className="text-xs font-medium mt-1 text-amber-600">{juridicoPct(juridico?.aReceber ?? 0)} do total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Valor recebido</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">{brl(juridico?.recebido ?? 0)}</p>
              <p className="text-xs font-medium mt-1 text-emerald-600">{juridicoPct(juridico?.recebido ?? 0)} do total</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Parcelas em atraso</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/relatorios">Ver relatório</Link></Button>
        </CardHeader>
        <CardContent>
          {!overdueList?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma parcela em atraso. 🎉</p>
          ) : (
            <div className="space-y-2">
              {overdueList.map((i: any) => (
                <Link
                  key={i.id}
                  to="/contratos/$id"
                  params={{ id: i.contracts.id }}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-accent transition"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm">{i.contracts.customers?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.contracts.description} · Parcela {i.number} · Venc. {fmtDate(i.due_date)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{brl(i.amount)}</span>
                    <Badge variant="destructive">Atrasada</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}