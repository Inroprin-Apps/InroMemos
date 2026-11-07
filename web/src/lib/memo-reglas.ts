/**
 * Reglas puras de la Plataforma de Memorandums, portadas de su diseño en Apps
 * Script (05_Validaciones, 06_Cierre y 07_Correlativo). La base las vuelve a
 * exigir (supabase/migrations/…_memos.sql): acá solo sirven para avisar
 * mientras se escribe, antes de enviar.
 */

/** Pesos del dígito verificador del RUC (SUNAT, módulo 11). */
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * RUC de 11 dígitos con su dígito verificador. Prefijos válidos: 10 (persona
 * natural), 15, 16, 17 y 20 (persona jurídica). Un RUC mal tecleado casi
 * siempre falla el dígito: es la forma más barata de evitar un pago al
 * proveedor equivocado.
 */
export function rucValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const suma = PESOS_RUC.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const digito = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return digito === Number(ruc[10]);
}

export const dniValido = (dni: string) => /^\d{8}$/.test(dni);

export type TipoDocumento = "RUC" | "DNI" | "OTRO";

/** Qué es un identificador de beneficiario, por su forma. */
export function tipoDocumento(id: string): TipoDocumento {
  const d = soloDigitos(id);
  if (d.length === 11 && d === id.trim()) return "RUC";
  if (d.length === 8 && d === id.trim()) return "DNI";
  return "OTRO";
}

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Bancos con nombre canónico: el que se escribe en la línea y en el RG. */
export const BANCOS = ["BCP", "BBVA", "INTERBANK", "SCOTIABANK", "BANCO DE LA NACION", "BANBIF", "CAJA AREQUIPA"] as const;
export type Banco = (typeof BANCOS)[number];

const ALIAS_BANCO: [RegExp, Banco][] = [
  [/\b(BCP|CREDITO)\b/, "BCP"],
  [/\b(BBVA|CONTINENTAL)\b/, "BBVA"],
  [/\bINTERBANK\b/, "INTERBANK"],
  [/\bSCOTIA/, "SCOTIABANK"],
  [/\bNACION\b/, "BANCO DE LA NACION"],
  [/\bBANBIF\b|\bBIF\b/, "BANBIF"],
  [/\bAREQUIPA\b/, "CAJA AREQUIPA"],
];

/** «Banco de Crédito del Perú» → «BCP». Nulo si no se reconoce. */
export function bancoCanonico(texto: string): Banco | null {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  for (const [re, banco] of ALIAS_BANCO) if (re.test(t)) return banco;
  return null;
}

/** Los tres primeros dígitos del CCI dicen el banco. */
const PREFIJO_CCI: Record<string, Banco> = {
  "002": "BCP",
  "003": "INTERBANK",
  "009": "SCOTIABANK",
  "011": "BBVA",
  "018": "BANCO DE LA NACION",
  "038": "BANBIF",
};

export type RevisionCci = { valido: boolean; banco: Banco | null; aviso: string | null };

/**
 * CCI de 20 dígitos. Si el banco declarado no es el que dice el prefijo, se
 * avisa: es la señal típica de una cuenta copiada de otro proveedor.
 */
export function revisarCci(cci: string, bancoDeclarado?: string): RevisionCci {
  const d = soloDigitos(cci);
  if (d.length !== 20) return { valido: false, banco: null, aviso: "El CCI tiene 20 dígitos." };
  const banco = PREFIJO_CCI[d.slice(0, 3)] ?? null;
  const declarado = bancoDeclarado ? bancoCanonico(bancoDeclarado) : null;
  const aviso =
    banco && declarado && banco !== declarado ? `El CCI es de ${banco}, pero el banco dice ${declarado}.` : null;
  return { valido: true, banco, aviso };
}

/** Lo que se guarda y se muestra de una cuenta: solo los últimos 4 dígitos. */
export function enmascarar(cuenta: string): string {
  const d = soloDigitos(cuenta);
  return d.length <= 4 ? d : `••••${d.slice(-4)}`;
}

/**
 * «F001-599», « f001 - 00000599 » → serie F001, número 00000599 (8 cifras),
 * y la clave sin ceros para encontrar repetidos (F001-599).
 */
export function comprobante(texto: string): { serie: string; numero: string; texto: string; clave: string } | null {
  const m = texto.trim().match(/^([A-Za-z0-9]{1,4})\s*[-–—]\s*(\d{1,10})$/);
  if (!m) return null;
  const serie = m[1].toUpperCase();
  const numero = m[2].replace(/^0+(?=\d)/, "").padStart(8, "0");
  return { serie, numero, texto: `${serie}-${numero}`, clave: `${serie.replace(/^0+(?=.)/, "")}-${Number(m[2])}` };
}

/**
 * Un monto como lo escribe la gente: «S/ 1,799.00», «1.799,00», «12,5».
 * La última coma o punto con 1–2 cifras detrás es el decimal.
 */
export function monto(texto: string): number | null {
  const t = texto.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const m = t.match(/^(-?[\d.,]*?)[.,](\d{1,2})$/);
  const entero = (m ? m[1] : t).replace(/[.,]/g, "");
  const n = Number(m ? `${entero}.${m[2]}` : entero);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** «029-2026-FINANZAS»: el número del memo como se ve en el papel. */
export const numeroVisible = (numero: number, anio: number, area: string) =>
  `${String(numero).padStart(3, "0")}-${anio}-${area}`;

/** «INR|029-2026-FINANZAS»: el que se entrega a InroPay y al RG. */
export const idTecnico = (codigoEmpresa: string, visible: string) => `${codigoEmpresa}|${visible}`;

// ---------------------------------------------------------------------------
// Corte y pago. Finanzas entrega la programación a las 17:00, pero todo pasa
// por revisión: el corte de memos es lunes y miércoles a las 16:00 (estricto:
// a las 16:00 exactas ya no entra) y el pago, martes y jueves. Lima es UTC-5
// todo el año: se calcula con aritmética, sin depender del huso del equipo.
// ---------------------------------------------------------------------------

const LIMA = -5 * 3600_000;
const HORA_CORTE = 16;
const DIAS_CORTE = [1, 3]; // lunes, miércoles

/** La fecha en Lima como si fuera UTC: para leer día y hora sin husos. */
const enLima = (d: Date) => new Date(d.getTime() + LIMA);
const desdeLima = (d: Date) => new Date(d.getTime() - LIMA);

export type Ciclo = { corte: Date; pago: Date };

/** El próximo corte que todavía alcanza algo aprobado en `momento`, y su pago. */
export function proximoCiclo(momento: Date): Ciclo {
  const l = enLima(momento);
  for (let i = 0; i < 8; i++) {
    const dia = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + i, HORA_CORTE));
    if (!DIAS_CORTE.includes(dia.getUTCDay())) continue;
    if (dia.getTime() <= l.getTime()) continue; // a las 16:00 exactas ya no entra
    const pago = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() + 1));
    return { corte: desdeLima(dia), pago: desdeLima(pago) };
  }
  throw new Error("Sin corte en la semana: no debería pasar.");
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** «miércoles 11 nov, 4:00 pm» en hora de Lima. */
export function textoCorte(d: Date): string {
  const l = enLima(d);
  const h = l.getUTCHours();
  const hora = `${h % 12 || 12}:${String(l.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  return `${DIAS[l.getUTCDay()]} ${l.getUTCDate()} ${MESES[l.getUTCMonth()]}, ${hora}`;
}

/** «jueves 12 nov» en hora de Lima. */
export function textoDia(d: Date): string {
  const l = enLima(d);
  return `${DIAS[l.getUTCDay()]} ${l.getUTCDate()} ${MESES[l.getUTCMonth()]}`;
}
