import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ShieldCheck, Loader2, Camera, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate, maskDocument, valorPorExtenso } from "@/lib/format";

export const Route = createFileRoute("/v/$token")({
  head: () => ({
    meta: [
      { title: "Recibo de Venda — Assinatura Digital" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Confira os itens vendidos, o plano de parcelamento e firme o trato com assinatura digital e foto." },
    ],
  }),
  component: PublicSale,
});

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
  }, []);

  function pos(e: any) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const t = e.touches?.[0];
    const x = (t ? t.clientX : e.clientX) - rect.left;
    const y = (t ? t.clientY : e.clientY) - rect.top;
    return { x: x * (c.width / rect.width), y: y * (c.height / rect.height) };
  }
  function start(e: any) {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: any) {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  }

  return (
    <div>
      <div className="rounded-md border bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-40 touch-none"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Pencil className="w-3 h-3" /> Assine no espaço acima</span>
        <button type="button" onClick={clear} className="text-primary hover:underline flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Limpar</button>
      </div>
    </div>
  );
}

function SelfieCapture({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  async function start() {
    setStarting(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      setStream(s);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => undefined);
        }
      }, 50);
    } catch (e: any) {
      toast.error("Não foi possível acessar a câmera: " + (e?.message || e));
    } finally { setStarting(false); }
  }

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.7);
    setPreview(url);
    onChange(url);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  function retake() {
    setPreview(null);
    onChange(null);
    start();
  }

  function onFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setPreview(url);
      onChange(url);
    };
    reader.readAsDataURL(f);
  }

  return (
    <div className="space-y-2">
      {preview ? (
        <div className="space-y-2">
          <img src={preview} alt="Selfie" className="w-40 h-40 object-cover rounded-md border" />
          <Button variant="outline" size="sm" onClick={retake}><RotateCcw className="w-4 h-4 mr-1" /> Tirar novamente</Button>
        </div>
      ) : stream ? (
        <div className="space-y-2">
          <video ref={videoRef} className="w-full max-w-xs rounded-md border bg-black" playsInline muted />
          <Button type="button" onClick={capture}><Camera className="w-4 h-4 mr-1" /> Capturar</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={start} disabled={starting}>
            <Camera className="w-4 h-4 mr-1" /> {starting ? "Abrindo câmera..." : "Abrir câmera"}
          </Button>
          <label className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-accent">
            Enviar foto
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
      )}
    </div>
  );
}

function PublicSale() {
  const { token } = Route.useParams();
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [selfie, setSelfie] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/public/sales/${token}`);
      if (!r.ok) { setPayload(null); return; }
      setPayload(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [token]);

  async function accept() {
    if (name.trim().length < 3) return toast.error("Informe seu nome completo");
    if (doc.trim().length < 5) return toast.error("Informe seu CPF/CNPJ");
    if (!selfie) return toast.error("Tire uma selfie para firmar o trato");
    if (!signature) return toast.error("Assine no espaço indicado");
    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/sales/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), document: doc.trim(), selfie, signature }),
      });
      const text = await r.text();
      let j: any = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      if (!r.ok) return toast.error(j.error ?? `Falha ao registrar aceite (HTTP ${r.status})`);
      toast.success("Venda firmada com sucesso!");
      load();
    } catch (e: any) {
      toast.error("Erro de conexão: " + (e?.message || e));
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!payload?.sale) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold mb-2">Recibo não encontrado</h1><p className="text-muted-foreground text-sm">O link pode ter expirado ou é inválido.</p></div></div>;

  const sale = payload.sale;
  const company = payload.company || {};
  const snap = sale.customer_snapshot || {};
  const items: any[] = sale.items || [];
  const accepted = !!sale.accepted_at;
  const noteValue = Math.max(0, Number(sale.total_amount || 0) - Number(sale.entry_amount || 0)) || Number(sale.total_amount || 0);
  const companyDocument = company.document || company.cnpj || "";

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recibo de Venda {sale.receipt_number ? `Nº ${sale.receipt_number}` : ""}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Emitido em {new Date(sale.created_at).toLocaleString("pt-BR")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(company.logo_url || company.name) && (
              <div className="flex items-center gap-3 pb-3 border-b">
                {company.logo_url && <img src={company.logo_url} alt="" className="h-16 w-auto object-contain" />}
                <div className="text-sm">
                  {company.name && <p className="font-semibold text-base">{company.name}</p>}
                  {company.document && <p className="text-muted-foreground">CNPJ/CPF: {company.document}</p>}
                  {company.address && <p className="text-muted-foreground">{company.address}</p>}
                  {(company.phone || company.email) && (
                    <p className="text-muted-foreground">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-1">Cliente</h3>
              <p className="text-sm">{snap.name}</p>
              {snap.document && <p className="text-xs text-muted-foreground">Doc: {snap.document}</p>}
              {snap.email && <p className="text-xs text-muted-foreground">Email: {snap.email}</p>}
              {snap.phone && <p className="text-xs text-muted-foreground">Tel: {snap.phone}</p>}
              {(() => {
                const linha1 = [snap.street, snap.number && `nº ${snap.number}`, snap.quadra && `Qd. ${snap.quadra}`, snap.complement].filter(Boolean).join(", ");
                const linha2 = [snap.neighborhood, [snap.city, snap.state].filter(Boolean).join("/"), snap.cep && `CEP ${snap.cep}`].filter(Boolean).join(" · ");
                return (
                  <>
                    {linha1 && <p className="text-xs text-muted-foreground">Endereço: {linha1}</p>}
                    {linha2 && <p className="text-xs text-muted-foreground">{linha2}</p>}
                    {!linha1 && !linha2 && snap.address && <p className="text-xs text-muted-foreground">Endereço: {snap.address}</p>}
                  </>
                );
              })()}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Itens</h3>
              <div className="rounded border divide-y">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{it.description}</p>
                      <p className="text-xs text-muted-foreground">{it.quantity} × {brl(it.unit_price)}</p>
                    </div>
                    <p className="font-medium">{brl(Number(it.quantity || 0) * Number(it.unit_price || 0))}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Subtotal</p><p className="font-semibold">{brl(sale.items_total)}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Desconto</p><p className="font-semibold">{brl(sale.discount)}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Entrada</p><p className="font-semibold">{brl(sale.entry_amount)}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold text-primary">{brl(sale.total_amount)}</p></div>
            </div>

            <div className="rounded border p-3 bg-muted/40">
              <p className="text-sm">
                <b>Parcelamento:</b> {sale.installments_count}× de {brl(sale.installment_amount)}
                {" · "}1º vencimento em {fmtDate(sale.first_due_date)}
              </p>
            </div>
            {sale.notes && <p className="text-sm whitespace-pre-wrap"><b>Observações:</b> {sale.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nota Promissória vinculada à venda</CardTitle>
            <p className="text-xs text-muted-foreground">
              Esta nota será firmada junto com o recibo usando a mesma assinatura digital e selfie de confirmação.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border p-4 bg-card">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Emitente / Devedor</p>
                  <p className="font-semibold">{snap.name || sale.accepted_name}</p>
                  {(snap.document || sale.accepted_document) && (
                    <p className="text-xs text-muted-foreground">Documento: {snap.document || sale.accepted_document}</p>
                  )}
                </div>
                <div className="md:text-right">
                  <p className="text-xs text-muted-foreground">Valor da promissória</p>
                  <p className="text-lg font-bold text-primary">{brl(noteValue)}</p>
                  <p className="text-xs text-muted-foreground">{valorPorExtenso(noteValue)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <div className="rounded border bg-muted/40 p-2">
                  <p className="text-xs text-muted-foreground">Credor / Beneficiário</p>
                  <p className="font-medium">{company.name || "Empresa credora"}</p>
                  {companyDocument && <p className="text-xs text-muted-foreground">CNPJ/CPF: {companyDocument}</p>}
                </div>
                <div className="rounded border bg-muted/40 p-2">
                  <p className="text-xs text-muted-foreground">Parcelamento</p>
                  <p className="font-medium">{sale.installments_count}× de {brl(sale.installment_amount)}</p>
                  <p className="text-xs text-muted-foreground">Primeiro vencimento: {fmtDate(sale.first_due_date)}</p>
                </div>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                O(a) devedor(a) promete pagar ao credor, ou à sua ordem, o valor acima, vinculado ao recibo de venda e ao parcelamento apresentado. Em caso de atraso, poderão incidir multa, juros, correção monetária e despesas de cobrança, conforme condições do trato firmado.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Firmar o trato</CardTitle></CardHeader>
          <CardContent>
            {accepted ? (
              <div className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">Venda firmada</p>
                  <p className="text-muted-foreground">Por <b>{sale.accepted_name}</b> ({sale.accepted_document}) em {new Date(sale.accepted_at).toLocaleString("pt-BR")}.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ao firmar você reconhece a venda, concorda com o parcelamento e assina também a nota promissória vinculada acima. Serão registrados nome, documento, selfie, assinatura, IP e navegador como comprovação.
                </p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
                  <div><Label>CPF/CNPJ</Label><Input value={doc} onChange={(e) => setDoc(maskDocument(e.target.value))} maxLength={40} /></div>
                </div>
                <div>
                  <Label>Selfie de confirmação</Label>
                  <SelfieCapture onChange={setSelfie} />
                </div>
                <div>
                  <Label>Assinatura digital</Label>
                  <SignaturePad onChange={setSignature} />
                </div>
                <Button onClick={accept} disabled={submitting} className="w-full md:w-auto">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Firmar o trato
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}