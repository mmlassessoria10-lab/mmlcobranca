import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { PIX_KEY, PIX_KEY_LABEL, buildPixPayload } from "@/lib/pix";
import { brl } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount?: number;
  title?: string;
  txid?: string;
}

export function PixQrDialog({ open, onOpenChange, amount, title, txid }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [payload, setPayload] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const p = buildPixPayload({ amount, txid });
    setPayload(p);
    QRCode.toDataURL(p, { margin: 1, width: 320 }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [open, amount, txid]);

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Código PIX copiado (copia e cola)");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }
  async function copyKey() {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      toast.success("Chave PIX copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? "Pagamento via PIX"}</DialogTitle>
          <DialogDescription>
            {amount ? <>Valor: <b>{brl(amount)}</b> — </> : null}
            Aponte a câmera do seu banco para o QR Code ou use o código PIX copia-e-cola.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {dataUrl ? (
            <img src={dataUrl} alt="QR Code PIX" className="w-64 h-64 border rounded-md bg-white p-2" />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center text-sm text-muted-foreground">
              Gerando QR Code...
            </div>
          )}
          <div className="text-xs text-center text-muted-foreground">
            Chave PIX ({PIX_KEY_LABEL}): <span className="font-mono">{PIX_KEY}</span>
          </div>
          <textarea
            readOnly
            value={payload}
            className="w-full h-20 text-[10px] font-mono border rounded-md p-2 bg-muted/40 resize-none"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={copyKey}>
            <Copy className="w-4 h-4 mr-2" /> Copiar chave
          </Button>
          <Button size="sm" onClick={copyPayload}>
            <Copy className="w-4 h-4 mr-2" /> Copiar código PIX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}