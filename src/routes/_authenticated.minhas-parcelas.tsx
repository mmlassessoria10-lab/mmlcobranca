import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate, installmentStatus } from "@/lib/format";
import { Wallet, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/minhas-parcelas")({
  head: () => ({ meta: [{ title: "Minhas Parcelas | Photogenic" }] }),
  component: MinhasParcelas,
});

function MinhasParcelas() {
  const { data, isLoading } = useQuery({
    queryKey: ["minhas-parcelas"],
    queryFn: async () => {
      const { data: customer } = await supabase
        .from("customers")
        .select("id,name,email,document")
        .maybeSingle();
      if (!customer) return { customer: null, contracts: [] as any[] };
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id,description,total_amount,installments_count,first_due_date,status,created_at,installments(id,number,due_date,amount,status,paid_at)")
        .order("created_at", { ascending: false });
      return { customer, contracts: contracts ?? [] };
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  if (!data?.customer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nenhum cadastro encontrado</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a um cadastro de cliente. Entre em contato com o financeiro para regularizar o acesso.
        </CardContent>
      </Card>
    );
  }

  const allInstallments = (data.contracts ?? []).flatMap((c: any) => c.installments ?? []);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let total = 0, pago = 0, aberto = 0, atrasado = 0;
  allInstallments.forEach((i: any) => {
    const amt = Number(i.amount);
    total += amt;
    if (i.paid_at) { pago += amt; return; }
    aberto += amt;
    const d = new Date(i.due_date + "T00:00:00");
    if (d < today) atrasado += amt;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {data.customer.name}</h1>
        <p className="text-sm text-muted-foreground">Acompanhe abaixo os seus parcelamentos.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<Wallet className="w-4 h-4" />} label="Total" value={brl(total)} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} label="Pago" value={brl(pago)} />
        <StatCard icon={<Clock className="w-4 h-4 text-amber-600" />} label="Em aberto" value={brl(aberto)} />
        <StatCard icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Em atraso" value={brl(atrasado)} />
      </div>

      {data.contracts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Você ainda não possui contratos.
          </CardContent>
        </Card>
      ) : (
        data.contracts.map((c: any) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-base">{c.description}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.installments_count}x · Início {fmtDate(c.first_due_date)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{brl(c.total_amount)}</div>
                  <Badge variant="outline" className="mt-1">{c.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4">Nº</th>
                      <th className="py-2 pr-4">Vencimento</th>
                      <th className="py-2 pr-4">Valor</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Pago em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(c.installments ?? [])
                      .slice()
                      .sort((a: any, b: any) => a.number - b.number)
                      .map((i: any) => {
                        const s = installmentStatus(i.due_date, i.paid_at);
                        return (
                          <tr key={i.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">{i.number}</td>
                            <td className="py-2 pr-4">{fmtDate(i.due_date)}</td>
                            <td className="py-2 pr-4">{brl(i.amount)}</td>
                            <td className="py-2 pr-4">
                              <Badge variant={s.variant}>{s.label}</Badge>
                            </td>
                            <td className="py-2">{i.paid_at ? fmtDate(i.paid_at) : "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}