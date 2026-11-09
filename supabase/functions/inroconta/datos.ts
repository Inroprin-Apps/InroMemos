// El contrato con INROCONTA y cómo cada fila se convierte en una fila de la
// copia local. Puro: sin red ni base, para probarlo.
//
// INROCONTA expone a otras apps GET /api/apps/<app>/datos/<conjunto>?pagina=N
// con «Authorization: Bearer <token>» y responde
// {conjunto, pagina, filas, siguiente, leido_en}: se pide ?pagina=<siguiente>
// hasta que sea null (src/modules/apps/domain/entities/AppData.ts de
// Inroprin-Apps/Inroconta).

export type Conjunto = "padron" | "ssco" | "sire";
export const CONJUNTOS: readonly Conjunto[] = ["padron", "ssco", "sire"];

export interface PadronRow {
  ruc: string;
  razon_social: string | null;
  estado: string | null;
  condicion: string | null;
  tipo_contribuyente: string | null;
  buen_contribuyente: boolean | null;
  agente_retencion: boolean | null;
}

export interface SscoRow {
  ruc: string;
  razon_social: string;
  resolucion: string;
  firme_desde: string | null;
  publicado_el: string | null;
}

export interface SireRow {
  periodo: number | null;
  proveedor_ruc: string;
  proveedor_nombre: string | null;
  tipo_comprobante: string;
  serie: string;
  numero: string;
  fecha_emision: string | null;
  moneda: string | null;
  total: number | null;
  estado: string | null;
  oc: string[];
  centro_costo: string[];
  concar: unknown[];
}

export interface Pagina<T> {
  conjunto: Conjunto;
  pagina: number;
  filas: T[];
  siguiente: number | null;
  leido_en: string;
}

const ruc = (s: unknown) => (typeof s === "string" && /^\d{11}$/.test(s.trim()) ? s.trim() : null);
const texto = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
/** «2026-10-05», «2026-10-05T00:00:00Z» o «05/10/2026» → «2026-10-05». */
export function fecha(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const pe = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return pe ? `${pe[3]}-${pe[2]}-${pe[1]}` : null;
}

export function filaContribuyente(r: PadronRow) {
  const r_ = ruc(r.ruc);
  if (!r_) return null;
  return {
    ruc: r_,
    razon_social: texto(r.razon_social),
    estado: texto(r.estado)?.toUpperCase() ?? null,
    condicion: texto(r.condicion)?.toUpperCase() ?? null,
    tipo_contribuyente: texto(r.tipo_contribuyente),
    buen_contribuyente: r.buen_contribuyente ?? null,
    agente_retencion: r.agente_retencion ?? null,
  };
}

export function filaSsco(r: SscoRow) {
  const r_ = ruc(r.ruc);
  if (!r_) return null;
  return {
    ruc: r_,
    razon_social: texto(r.razon_social),
    ssco_resolucion: texto(r.resolucion),
    ssco_desde: fecha(r.firme_desde) ?? fecha(r.publicado_el),
  };
}

export function filaSire(r: SireRow) {
  const r_ = ruc(r.proveedor_ruc);
  const serie = texto(r.serie);
  const numero = texto(r.numero);
  const tipo = texto(r.tipo_comprobante);
  if (!r_ || !serie || !numero || !tipo) return null;
  return {
    proveedor_ruc: r_,
    tipo: tipo.padStart(2, "0"),
    serie: serie.toUpperCase(),
    numero,
    periodo: typeof r.periodo === "number" ? r.periodo : null,
    proveedor_nombre: texto(r.proveedor_nombre),
    fecha_emision: fecha(r.fecha_emision),
    moneda: texto(r.moneda),
    total: typeof r.total === "number" ? Math.round(r.total * 100) / 100 : null,
    estado: texto(r.estado),
    oc: Array.isArray(r.oc) ? r.oc.filter((x) => typeof x === "string") : [],
    centro_costo: Array.isArray(r.centro_costo) ? r.centro_costo.filter((x) => typeof x === "string") : [],
    en_concar: Array.isArray(r.concar) && r.concar.length > 0,
  };
}

/** Una tanda de N filas: lo que se manda a la base de una vez. */
export function* tandas<T>(filas: T[], n = 500): Generator<T[]> {
  for (let i = 0; i < filas.length; i += n) yield filas.slice(i, i + n);
}

/** Tope de páginas: 1000 filas cada una; más que esto es un error de la respuesta. */
const MAX_PAGINAS = 500;

/**
 * Todas las filas de un conjunto, página por página. Falla en palabras si
 * INROCONTA no responde o responde algo que no es el contrato.
 */
export async function leerConjunto<T>(
  f: typeof fetch,
  base: string,
  token: string,
  conjunto: Conjunto,
): Promise<T[]> {
  const filas: T[] = [];
  let pagina: number | null = 0;
  for (let vuelta = 0; pagina !== null; vuelta++) {
    if (vuelta >= MAX_PAGINAS) throw new Error(`INROCONTA devolvió más de ${MAX_PAGINAS} páginas de ${conjunto}.`);
    const url = `${base.replace(/\/+$/, "")}/api/apps/inromemos/datos/${conjunto}?pagina=${pagina}`;
    const r = await f(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (r.status === 401 || r.status === 403) {
      throw new Error("INROCONTA rechazó el token de INROMEMOS: revisa INROCONTA_TOKEN y APPS_DATOS_TOKENS.");
    }
    if (!r.ok) throw new Error(`INROCONTA respondió ${r.status} al pedir ${conjunto} (página ${pagina}).`);
    const p = (await r.json()) as Pagina<T>;
    if (!p || p.conjunto !== conjunto || !Array.isArray(p.filas)) {
      throw new Error(`La respuesta de INROCONTA para ${conjunto} no tiene la forma esperada.`);
    }
    filas.push(...p.filas);
    if (p.siguiente !== null && (typeof p.siguiente !== "number" || p.siguiente <= pagina)) {
      throw new Error(`INROCONTA indicó una página siguiente inválida para ${conjunto}.`);
    }
    pagina = p.siguiente;
  }
  return filas;
}
