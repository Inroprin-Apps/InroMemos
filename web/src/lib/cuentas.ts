/**
 * Las cuentas de una rendición: cuánto se gastó, cuánto sustenta y cuánto
 * queda.
 *
 * Portado de app/rendicion.js, que reprodujo al centavo la plantilla real del
 * memo 675: doce comprobantes suman S/ 347.50, pero el monto rendido es
 * S/ 242.00 porque las dos declaraciones juradas no sustentan ante SUNAT. Y el
 * saldo se mide contra lo GASTADO, no contra lo sustentado: una DJ es plata
 * que salió del bolsillo aunque no sustente.
 */

export type FilaParaCuentas = {
  total: number | string | null;
  tipo_comprobante_id: string | null;
  descartado: boolean;
  moneda?: string;
};

export type Cuentas = {
  gastado: number;
  sustentado: number;
  noSustenta: number;
  /** Positivo: sobra y se devuelve. Negativo: se gastó de más y se reembolsa. */
  saldo: number;
  /** Cuánto del monto se gastó, 0–100+. Nulo si no hay monto. */
  consumo: number | null;
  comprobantes: number;
  /** Lo que está en dólares: no se suma a los soles ni se convierte acá. */
  dolares: number;
  porTipo: { tipo: string; cuantos: number; importe: number; sustenta: boolean }[];
};

export const aNumero = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Redondeo a céntimos: sumar 0.1 + 0.2 en coma flotante no da 0.3. */
const centimos = (n: number) => Math.round(n * 100) / 100;

export function cuentas(filas: FilaParaCuentas[], monto: number | string, noSustentan: string[]): Cuentas {
  const excluidos = new Set(noSustentan);
  // Lo descartado queda a la vista y en el historial, pero no suma.
  const vivas = filas.filter((f) => !f.descartado);

  let gastado = 0;
  let sustentado = 0;
  let dolares = 0;
  const porTipo = new Map<string, { tipo: string; cuantos: number; importe: number; sustenta: boolean }>();
  for (const f of vivas) {
    const importe = aNumero(f.total);
    if (f.moneda === "USD") {
      dolares += importe;
      continue;
    }
    gastado += importe;
    const tipo = f.tipo_comprobante_id ?? "SIN_TIPO";
    const sustenta = tipo !== "SIN_TIPO" && !excluidos.has(tipo);
    if (sustenta) sustentado += importe;
    const t = porTipo.get(tipo) ?? { tipo, cuantos: 0, importe: 0, sustenta };
    t.cuantos += 1;
    t.importe = centimos(t.importe + importe);
    porTipo.set(tipo, t);
  }

  const recibido = aNumero(monto);
  return {
    gastado: centimos(gastado),
    sustentado: centimos(sustentado),
    noSustenta: centimos(gastado - sustentado),
    saldo: centimos(recibido - gastado),
    consumo: recibido > 0 ? Math.round((gastado / recibido) * 100) : null,
    comprobantes: vivas.length,
    dolares: centimos(dolares),
    porTipo: [...porTipo.values()].sort((a, b) => b.importe - a.importe),
  };
}

/** Cuánto se gastó en cada proyecto (soles; lo descartado y los dólares no suman). Lo más grande primero. */
export function porProyecto(filas: (FilaParaCuentas & { proyecto_id: number | null })[]): { proyecto_id: number | null; cuantos: number; importe: number }[] {
  const grupos = new Map<number | null, { proyecto_id: number | null; cuantos: number; importe: number }>();
  for (const f of filas) {
    if (f.descartado || f.moneda === "USD") continue;
    const g = grupos.get(f.proyecto_id) ?? { proyecto_id: f.proyecto_id, cuantos: 0, importe: 0 };
    g.cuantos += 1;
    g.importe = centimos(g.importe + aNumero(f.total));
    grupos.set(f.proyecto_id, g);
  }
  return [...grupos.values()].sort((a, b) => b.importe - a.importe);
}

export const soles = (n: number | string | null | undefined) =>
  `S/ ${aNumero(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
