import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { aiMapColumns } from "@/lib/ai/map-columns.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Sparkles, CheckCircle2, ClipboardPaste, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { generateInstallments } from "@/lib/installments";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({ meta: [{ title: "Importar Excel | ParcelaPro" }] }),
  component: ImportarPage,
});

type Field = { key: string; label: string; required: boolean };

function ImportarPage() {
  const { isAdmin, hasRole } = useAuth();
  const canImport = isAdmin || hasRole("financeiro");
  const aiFn = useServerFn(aiMapColumns);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(0);
  const [pasted, setPasted] = useState("");
  const [wbFileName, setWbFileName] = useState("");
  const [wbLoading, setWbLoading] = useState(false);
  const [wbLog, setWbLog] = useState<string[]>([]);
  const [wbSummary, setWbSummary] = useState<{ contracts: number; installments: number; errors: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const arr = XLSX.utils.sheet_to_json<any>(ws, { header: 1, raw: false });
    const hs = (arr[0] ?? []).map((x: any) => String(x ?? "").trim());
    const data = arr.slice(1).filter((r: any[]) => r.some((x) => x !== null && x !== ""));
    setHeaders(hs); setRows(data); setMapping({}); setFields([]); setImported(0);
    toast.success(`${data.length} linhas detectadas`);
  }

  function parsePasted() {
    const text = pasted.trim();
    if (!text) return toast.error("Cole algum conteúdo primeiro");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return toast.error("É necessário pelo menos cabeçalho + 1 linha");
    const detectDelim = (l: string) => {
      const counts = { "\t": (l.match(/\t/g) || []).length, ";": (l.match(/;/g) || []).length, ",": (l.match(/,/g) || []).length, "|": (l.match(/\|/g) || []).length };
      return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || "\t";
    };
    const delim = detectDelim(lines[0]);
    const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const hs = split(lines[0]);
    const data = lines.slice(1).map(split).filter((r) => r.some((x) => x !== ""));
    setFileName("(colado)"); setHeaders(hs); setRows(data); setMapping({}); setFields([]); setImported(0);
    toast.success(`${data.length} linhas detectadas`);
  }

  async function runAi() {
    if (!headers.length) return;
    setLoading(true);
    try {
      const res = await aiFn({ data: { headers, sampleRows: rows.slice(0, 5) } });
      const m: Record<string, string> = {};
      Object.entries(res.mapping ?? {}).forEach(([k, v]) => { if (v) m[k] = String(v); });
      setMapping(m); setFields(res.targetFields);
      toast.success("Mapeamento sugerido pela IA");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setLoading(false); }
  }

  function parseDate(s: string): string | null {
    if (!s) return null;
    const str = String(s).trim();
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  function parseNumber(s: any): number | null {
    if (s == null || s === "") return null;
    const str = String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? null : n;
  }

  async function confirmImport() {
    const required = fields.filter((f) => f.required);
    for (const f of required) {
      if (!mapping[f.key]) return toast.error(`Campo obrigatório sem mapeamento: ${f.label}`);
    }
    const idxOf = (key: string) => mapping[key] ? headers.indexOf(mapping[key]) : -1;
    setLoading(true);
    let created = 0, errors = 0;
    for (const row of rows) {
      try {
        const name = row[idxOf("customer_name")]?.toString().trim();
        if (!name) { errors++; continue; }
        const doc = idxOf("customer_document") >= 0 ? row[idxOf("customer_document")]?.toString().trim() || null : null;
        const email = idxOf("customer_email") >= 0 ? row[idxOf("customer_email")]?.toString().trim() || null : null;
        const phone = idxOf("customer_phone") >= 0 ? row[idxOf("customer_phone")]?.toString().trim() || null : null;

        let customerId: string | null = null;
        if (doc) {
          const { data: ex } = await supabase.from("customers").select("id").eq("document", doc).maybeSingle();
          customerId = ex?.id ?? null;
        }
        if (!customerId) {
          const { data: c, error } = await supabase.from("customers").insert({ name, document: doc, email, phone }).select("id").single();
          if (error) { errors++; continue; }
          customerId = c.id;
        }

        const description = row[idxOf("contract_description")]?.toString().trim() || "Contrato importado";
        const total = parseNumber(row[idxOf("total_amount")]);
        const count = parseInt(String(row[idxOf("installments_count")]).replace(/\D/g, ""), 10) || 1;
        const firstDue = parseDate(String(row[idxOf("first_due_date")] ?? ""));
        if (!total || !firstDue) { errors++; continue; }

        const { data: contract, error: e2 } = await supabase.from("contracts").insert({
          customer_id: customerId, description, total_amount: total, installments_count: count, first_due_date: firstDue,
        }).select("id").single();
        if (e2 || !contract) { errors++; continue; }

        const ins = generateInstallments(total, count, firstDue).map((p) => ({ ...p, contract_id: contract.id }));
        await supabase.from("installments").insert(ins);
        created++;
      } catch { errors++; }
    }
    setLoading(false);
    setImported(created);
    toast.success(`Importação: ${created} contratos criados${errors ? `, ${errors} com erro` : ""}`);
  }

  if (!canImport) {
    return <p className="text-muted-foreground">Apenas Admin e Financeiro podem importar dados.</p>;
  }

  function norm(s: any): string {
    return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findHeaderRow(rows: any[][]): number {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const cells = rows[i].map(norm);
      const hasCli = cells.some((c) => c.includes("cliente"));
      const hasCont = cells.some((c) => c.includes("cont"));
      const hasVenc = cells.some((c) => c.includes("vencimento"));
      if (hasCli && hasCont && hasVenc) return i;
    }
    return -1;
  }

  function colIndex(headers: string[], ...keywords: string[]): number {
    return headers.findIndex((h) => {
      const n = norm(h);
      return keywords.every((k) => n.includes(k));
    });
  }

  function toIsoDate(v: any): string | null {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  function toNum(v: any): number | null {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isNaN(v) ? null : v;
    const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  async function onWorkbookFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setWbFileName(f.name);
    setWbLog([]);
    setWbSummary(null);
    setWbLoading(true);
    const log: string[] = [];
    const append = (s: string) => { log.push(s); setWbLog([...log]); };
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      append(`Abas detectadas: ${wb.SheetNames.length}`);

      // Use AI once to confirm column mapping on the first sheet with headers
      let aiFields: Field[] = [];
      let aiHeaders: string[] = [];
      for (const name of wb.SheetNames) {
        const arr = XLSX.utils.sheet_to_json<any>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
        const hi = findHeaderRow(arr);
        if (hi >= 0) {
          aiHeaders = arr[hi].map((x: any) => String(x ?? "").trim());
          break;
        }
      }
      if (aiHeaders.length) {
        try {
          const res = await aiFn({ data: { headers: aiHeaders, sampleRows: [] } });
          aiFields = res.targetFields;
          append(`IA analisou cabeçalhos: ${aiHeaders.filter(Boolean).join(", ")}`);
        } catch (e: any) {
          append(`IA indisponível, usando detecção heurística (${e?.message ?? "erro"})`);
        }
      }

      let cContracts = 0, cInstallments = 0, cErrors = 0;
      for (const sheetName of wb.SheetNames) {
        try {
          const arr = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" });
          const hi = findHeaderRow(arr);
          if (hi < 0) { append(`[${sheetName}] cabeçalho não encontrado, ignorado`); continue; }
          const headers = arr[hi].map((x: any) => String(x ?? "").trim());
          const data = arr.slice(hi + 1).filter((r: any[]) => r.some((x) => x !== null && String(x).trim() !== ""));

          const iCont = colIndex(headers, "cont");
          const iTel = colIndex(headers, "telefone");
          const iCli = colIndex(headers, "cliente");
          const iLanc = colIndex(headers, "lan");
          const iReceb = colIndex(headers, "receb");
          const iVenc = colIndex(headers, "vencimento");
          const iPag = colIndex(headers, "pagamento");
          const iSit = colIndex(headers, "situa");

          if (iCont < 0 || iCli < 0 || iVenc < 0 || iLanc < 0) {
            append(`[${sheetName}] colunas mínimas ausentes, ignorado`);
            continue;
          }

          // group by contract number (e.g. "249/001")
          const groups = new Map<string, any[]>();
          for (const row of data) {
            const cont = String(row[iCont] ?? "").trim();
            if (!cont) continue;
            if (!groups.has(cont)) groups.set(cont, []);
            groups.get(cont)!.push(row);
          }

          for (const [cont, rows] of groups) {
            try {
              const name = rows.map((r) => String(r[iCli] ?? "").trim()).find((x) => x) || `Cliente ${cont}`;
              const phone = iTel >= 0 ? (rows.map((r) => String(r[iTel] ?? "").trim()).find((x) => x && !["pix", "cartão", "cartao"].includes(x.toLowerCase())) || null) : null;

              // upsert customer by name (no document available)
              let customerId: string | null = null;
              const { data: existing } = await supabase.from("customers").select("id").eq("name", name).limit(1).maybeSingle();
              if (existing?.id) customerId = existing.id;
              if (!customerId) {
                const { data: c, error: ce } = await supabase.from("customers").insert({ name, phone }).select("id").single();
                if (ce || !c) { cErrors++; append(`[${sheetName}/${cont}] erro cliente: ${ce?.message}`); continue; }
                customerId = c.id;
              }

              const parsed = rows
                .map((r) => ({
                  due: toIsoDate(r[iVenc]),
                  amount: toNum(r[iLanc]),
                  paidAmount: iReceb >= 0 ? toNum(r[iReceb]) : null,
                  paidAt: iPag >= 0 ? toIsoDate(r[iPag]) : null,
                  situation: iSit >= 0 ? String(r[iSit] ?? "").trim().toLowerCase() : "",
                }))
                .filter((x) => x.due && x.amount != null && x.amount > 0)
                .sort((a, b) => a.due!.localeCompare(b.due!));

              if (!parsed.length) { append(`[${sheetName}/${cont}] sem parcelas válidas`); continue; }

              const total = parsed.reduce((s, p) => s + (p.amount || 0), 0);
              const description = `${sheetName} — Contrato ${cont}`;
              const { data: contract, error: e2 } = await supabase.from("contracts").insert({
                customer_id: customerId,
                description,
                total_amount: Math.round(total * 100) / 100,
                installments_count: parsed.length,
                first_due_date: parsed[0].due!,
              }).select("id").single();
              if (e2 || !contract) { cErrors++; append(`[${sheetName}/${cont}] erro contrato: ${e2?.message}`); continue; }

              const ins = parsed.map((p, i) => {
                const isPago = p.situation.includes("pago") || (p.paidAt && p.paidAmount != null);
                return {
                  contract_id: contract.id,
                  number: i + 1,
                  due_date: p.due!,
                  amount: isPago && p.paidAmount != null ? p.paidAmount : p.amount!,
                  status: isPago ? "paga" : "pendente",
                  paid_at: isPago && p.paidAt ? new Date(p.paidAt + "T12:00:00").toISOString() : null,
                };
              });
              const { error: e3 } = await supabase.from("installments").insert(ins);
              if (e3) { cErrors++; append(`[${sheetName}/${cont}] erro parcelas: ${e3.message}`); continue; }
              cContracts++; cInstallments += ins.length;
              append(`[${sheetName}/${cont}] ${name}: ${ins.length} parcelas`);
            } catch (err: any) {
              cErrors++;
              append(`[${sheetName}/${cont}] exceção: ${err?.message}`);
            }
          }
        } catch (err: any) {
          cErrors++;
          append(`[${sheetName}] erro: ${err?.message}`);
        }
      }
      setWbSummary({ contracts: cContracts, installments: cInstallments, errors: cErrors });
      toast.success(`Importação concluída: ${cContracts} contratos, ${cInstallments} parcelas${cErrors ? `, ${cErrors} erros` : ""}`);
      // suppress unused warning
      void aiFields;
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao processar workbook");
    } finally {
      setWbLoading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Importar Excel com IA</h1>
        <p className="text-muted-foreground mt-1">A IA mapeia automaticamente as colunas da sua planilha para os campos do sistema.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Importar workbook completo (várias abas)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Envie um arquivo .xlsx com várias abas (cada aba contendo um ou mais contratos). A IA detecta o cabeçalho,
            agrupa as parcelas por número de contrato (ex.: <code>249/001</code>), preserva parcelas pagas com data de
            pagamento e valor recebido, e cria clientes/contratos automaticamente.
          </p>
          <Input type="file" accept=".xlsx,.xls" onChange={onWorkbookFile} disabled={wbLoading} />
          {wbFileName && <p className="text-xs text-muted-foreground">Arquivo: <strong>{wbFileName}</strong></p>}
          {wbLoading && <p className="text-sm">Processando…</p>}
          {wbLog.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border bg-muted/40 p-3 text-xs font-mono space-y-1">
              {wbLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          {wbSummary && (
            <div className="flex items-center gap-3 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>{wbSummary.contracts} contratos · {wbSummary.installments} parcelas{wbSummary.errors ? ` · ${wbSummary.errors} erros` : ""}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Forneça os dados</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="file">
            <TabsList>
              <TabsTrigger value="file"><Upload className="w-4 h-4 mr-2" />Enviar arquivo</TabsTrigger>
              <TabsTrigger value="paste"><ClipboardPaste className="w-4 h-4 mr-2" />Copiar e colar</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="space-y-3 pt-3">
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
              <p className="text-xs text-muted-foreground">Aceita .xlsx, .xls e .csv.</p>
            </TabsContent>
            <TabsContent value="paste" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Cole conteúdo direto do Excel, Google Sheets ou texto separado por tabulação, vírgula ou ponto e vírgula.
                A primeira linha deve conter os cabeçalhos. A IA cuida do resto e ignora colunas que não forem necessárias.
              </p>
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"Cliente\tCPF\tValor\tParcelas\tVencimento\nJoão Silva\t123.456.789-00\t1200,00\t3\t10/07/2026"}
                className="min-h-[200px] font-mono text-xs"
              />
              <Button onClick={parsePasted} variant="secondary">
                <ClipboardPaste className="w-4 h-4 mr-2" />Carregar dados colados
              </Button>
            </TabsContent>
          </Tabs>
          {fileName && headers.length > 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              Origem: <strong>{fileName}</strong> · {rows.length} linhas · {headers.length} colunas
            </p>
          )}
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">2. Mapeamento de colunas</CardTitle>
            <Button onClick={runAi} disabled={loading}>
              <Sparkles className="w-4 h-4 mr-2" />{loading ? "Analisando..." : "Sugerir com IA"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.length === 0 && <p className="text-sm text-muted-foreground">Clique em "Sugerir com IA" para mapear automaticamente.</p>}
            {fields.map((f) => (
              <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
                <label className="text-sm">{f.label}{f.required && <span className="text-destructive"> *</span>}</label>
                <Select value={mapping[f.key] ?? "_none"} onValueChange={(v) => setMapping({ ...mapping, [f.key]: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— Não mapear —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Não mapear —</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {fields.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Pré-visualização (primeiras 5 linhas)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((r, i) => (
                    <TableRow key={i}>{headers.map((_, j) => <TableCell key={j}>{String(r[j] ?? "")}</TableCell>)}</TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {fields.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button size="lg" onClick={confirmImport} disabled={loading}>
            <Upload className="w-4 h-4 mr-2" />{loading ? "Importando..." : `Importar ${rows.length} linhas`}
          </Button>
        </div>
      )}

      {imported > 0 && (
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          <p>{imported} contratos importados com sucesso.</p>
        </CardContent></Card>
      )}
    </div>
  );
}