export const PIX_KEY = "+5565992479161";
export const PIX_KEY_LABEL = "Celular";

export async function copyPix(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(PIX_KEY);
    return true;
  } catch {
    return false;
  }
}