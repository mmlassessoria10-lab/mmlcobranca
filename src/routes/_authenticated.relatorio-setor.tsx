import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/format";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorio-setor")({
  head: () => ({ meta: [{ title: "Contas a Pagar x Receber por Setor" }] }),
  component: RelatorioSetorPage,
});

type Row = {
  sector: string;
  arTotal: number; arPago: number; arPendente: number; arAtrasado: number;
  apTotal: number; apPago: number; apPendente: number; apAtrasado: number;
};

const SEM = "(sem setor)";

function RelatorioSetorPage() {
  const [statusAR, setStatusAR] = useState<"todos" | "pago" | "pendente" | "atrasado">("todos");
  const [statusAP, setStatusAP] = useState<"todos" | "paga" | "pendente" | "atrasada" | "cancelada">("todos");
  const [q, setQ] = useState("");

  const { data: recRows } = useQuery({
    queryKey: ["ap-ar-setor-installments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("installments")
        .select("amount,due_date,paid_at,contracts!inner(legal_status,customers(sector))")
        .not("contracts.legal_status", "eq", "juridico");
      return data ?? [];
    },
  });

  const { data: payRows } = useQuery({
    queryKey: ["ap-ar-setor-payables"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payables")
        .select("amount,due_date,paid_at,status,sector");
      return data ?? [];
    },
  });

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    const get = (s: string) => {
      const key = (s || SEM).trim() || SEM;
      if (!map.has(key)) map.set(key, { sector: key, arTotal: 0, arPago: 0, arPendente: 0, arAtrasado: 0, apTotal: 0, apPago: 0, apPendente: 0, apAtrasado: 0 });
      return map.get(key)!;
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);

    (recRows ?? []).forEach((r: any) => {
      const sec = r.contracts?.customers?.sector ?? SEM;
      const amt = Number(r.amount);
      const row = get(sec);
      let kind: "pago" | "pendente" | "atrasado";
      if (r.paid_at) kind = "pago";
      else {
        const d = new Date(r.due_date + "T00:00:00");
        kind = d < today ? "atrasado" : "pendente";
      }
      if (statusAR !== "todos" && kind !== statusAR) return;
      row.arTotal += amt;
      if (kind === "pago") row.arPago += amt;
      else if (kind === "atrasado") row.arAtrasado += amt;
      else row.arPendente += amt;
    });

    (payRows ?? []).forEach((r: any) => {
      if (r.status === "cancelada") return;
      const sec = r.sector ?? SEM;
      const amt = Number(r.amount);
      const row = get(sec);
      let kind: "paga" | "pendente" | "atrasada";
      if (r.paid_at || r.status === "paga") kind = "paga";
      else {
        const d = new Date(r.due_date + "T00:00:00");
        kind = d < today || r.status === "atrasada" ? "atrasada" : "pendente";
      }
      if (statusAP !== "todos" && kind !== statusAP) return;
      row.apTotal += amt;
      if (kind === "paga") row.apPago += amt;
      else if (kind === "atrasada") row.apAtrasado += amt;
      else row.apPendente += amt;
    });

    let list = Array.from(map.values());
    if (q) {
      const t = q.toLowerCase();
      list = list.filter((r) => r.sector.toLowerCase().includes(t));
    }
    return list.sort((a, b) => (b.arTotal + b.apTotal) - (a.arTotal + a.apTotal));
  }, [recRows, payRows, statusAR, statusAP, q]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.arTotal += r.arTotal; acc.arPago += r.arPago; acc.arPendente += r.arPendente; acc.arAtrasado += r.arAtrasado;
      acc.apTotal += r.apTotal; acc.apPago += r.apPago; acc.apPendente += r.apPendente; acc.apAtrasado += r.apAtrasado;
      return acc;
    },
    { arTotal: 0, arPago: 0, arPendente: 0, arAtrasado: 0, apTotal: 0, apPago: 0, apPendente: 0, apAtrasado: 0 },
  );
  const saldoTotal = totals.arTotal - totals.apTotal;

  function exportCsv() {
    const header = [
      "Setor",
      "A Receber - Total", "A Receber - Pago", "A Receber - Pendente", "A Receber - Atrasado",
      "A Pagar - Total", "A Pagar - Pago", "A Pagar - Pendente", "A Pagar - Atrasado",
      "Saldo (Receber - Pagar)",
    ];
    const lines = [header.join(";")];
    rows.forEach((r) => {
      lines.push([
        r.sector,
        r.arTotal, r.arPago, r.arPendente, r.arAtrasado,
        r.apTotal, r.apPago, r.apPendente, r.apAtrasado,
        r.arTotal - r.apTotal,
      ].map((x) => typeof x === "number" ? x.toFixed(2).replace(".", ",") : `"${String(x).replace(/"/g, '""')}"`).join(";"));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas-pagar-x-receber-setor-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Contas a Pagar x Receber por Setor</h1>
        <p className="text-muted-foreground mt-1">
          Compare o volume financeiro a receber (parcelas dos contratos) com a contrapartida a pagar, agrupado por setor do cliente/lançamento.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total a receber</p><p className="text-xl font-bold text-emerald-600">{brl(totals.arTotal)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total a pagar</p><p className="text-xl font-bold text-amber-600">{brl(totals.apTotal)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Saldo (Receber − Pagar)</p><p className={`text-xl font-bold ${saldoTotal >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(saldoTotal)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Setores</p><p className="text-xl font-bold">{rows.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Buscar setor..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            <Select value={statusAR} onValueChange={(v: any) => setStatusAR(v)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="A receber: status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">A receber: todos</SelectItem>
                <SelectItem value="pago">A receber: pago</SelectItem>
                <SelectItem value="pendente">A receber: pendente</SelectItem>
                <SelectItem value="atrasado">A receber: atrasado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusAP} onValueChange={(v: any) => setStatusAP(v)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="A pagar: status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">A pagar: todos</SelectItem>
                <SelectItem value="paga">A pagar: paga</SelectItem>
                <SelectItem value="pendente">A pagar: pendente</SelectItem>
                <SelectItem value="atrasada">A pagar: atrasada</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Exportar CSV</Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2}>Setor</TableHead>
                  <TableHead colSpan={4} className="text-center border-l">A Receber</TableHead>
                  <TableHead colSpan={4} className="text-center border-l">A Pagar</TableHead>
                  <TableHead rowSpan={2} className="text-right border-l">Saldo</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="border-l text-right">Total</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Atrasado</TableHead>
                  <TableHead className="border-l text-right">Total</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Atrasado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const saldo = r.arTotal - r.apTotal;
                  return (
                    <TableRow key={r.sector}>
                      <TableCell className="font-medium">{r.sector}</TableCell>
                      <TableCell className="border-l text-right">{brl(r.arTotal)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{brl(r.arPago)}</TableCell>
                      <TableCell className="text-right text-amber-600">{brl(r.arPendente)}</TableCell>
                      <TableCell className="text-right text-destructive">{brl(r.arAtrasado)}</TableCell>
                      <TableCell className="border-l text-right">{brl(r.apTotal)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{brl(r.apPago)}</TableCell>
                      <TableCell className="text-right text-amber-600">{brl(r.apPendente)}</TableCell>
                      <TableCell className="text-right text-destructive">{brl(r.apAtrasado)}</TableCell>
                      <TableCell className={`border-l text-right font-semibold ${saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(saldo)}</TableCell>
                    </TableRow>
                  );
                })}
                {rows.length > 0 && (
                  <TableRow className="font-semibold bg-muted/40">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="border-l text-right">{brl(totals.arTotal)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{brl(totals.arPago)}</TableCell>
                    <TableCell className="text-right text-amber-600">{brl(totals.arPendente)}</TableCell>
                    <TableCell className="text-right text-destructive">{brl(totals.arAtrasado)}</TableCell>
                    <TableCell className="border-l text-right">{brl(totals.apTotal)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{brl(totals.apPago)}</TableCell>
                    <TableCell className="text-right text-amber-600">{brl(totals.apPendente)}</TableCell>
                    <TableCell className="text-right text-destructive">{brl(totals.apAtrasado)}</TableCell>
                    <TableCell className={`border-l text-right ${saldoTotal >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(saldoTotal)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {rows.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum dado.</p>}
        </CardContent>
      </Card>
    </div>
  );
}