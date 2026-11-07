// El contrato con InroPay, en lo que se puede probar sin red.

export const ESTADOS = ["en_analisis", "registrado", "observado_analisis", "programado", "pagado"] as const;
export type EstadoPago = (typeof ESTADOS)[number];

/** «Bearer abc» → «abc»; '' si no hay. Un token es largo e imprimible, o no es uno. */
export function bearer(h: string | null): string {
  const m = /^Bearer\s+([A-Za-z0-9._~-]{32,200})\s*$/.exec(h ?? "");
  return m ? m[1] : "";
}

export async function sha256(texto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación que tarda lo mismo acierte o no. */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function tokenNuevo(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** El memo de un estado que manda InroPay: por id técnico (INR|029-2026-FINANZAS) o por id_linea. */
export function idTecnicoDe(s: string): string | null {
  const m = /^([A-Z0-9]{2,5}\|\d{3,}-\d{4}-[A-Z0-9-]+?)(\|L\d+(\|v\d+)?)?$/.exec(s.trim());
  return m ? m[1] : null;
}
