/**
 * Un comprobante como fila de la rendición: cómo se escribe su número y qué le
 * falta para poder enviar.
 */

/**
 * «F001-6384» → serie F001, número 6384. Igual que partir_numero() del
 * procesador, salvo que acá los ceros a la izquierda se conservan: es lo que la
 * persona tecleó, y para encontrar repetidos ya normaliza la base (columna
 * comprobantes.clave). Las planillas vienen sin guion (010010): sin serie.
 */
export function partirNumero(texto: string): { serie: string; numero: string } {
  const t = texto.trim();
  const m = t.match(/^([A-Za-z0-9]{1,4})\s*[-–—]\s*([A-Za-z0-9]{1,15})$/);
  if (m) return { serie: m[1].toUpperCase(), numero: m[2].toUpperCase() };
  return { serie: "", numero: t.toUpperCase() };
}

export const numeroCompleto = (c: { serie: string; numero: string }) =>
  [c.serie, c.numero].filter(Boolean).join("-");

export type FilaParaRevisar = {
  fecha: string | null;
  tipo_comprobante_id: string | null;
  numero: string;
  total: number | string | null;
  proyecto_id: number | null;
  concepto_id: number | null;
  descartado: boolean;
};

/**
 * Lo que le falta a una fila para poder enviarse. La declaración jurada no
 * tiene número: es un papel que la persona escribe a mano.
 */
export function faltan(c: FilaParaRevisar): string[] {
  if (c.descartado) return [];
  const falta: string[] = [];
  if (!c.fecha) falta.push("fecha");
  if (!c.tipo_comprobante_id) falta.push("tipo");
  if (!c.numero.trim() && c.tipo_comprobante_id !== "DJ") falta.push("número");
  if (c.total == null || c.total === "") falta.push("total");
  if (c.proyecto_id == null) falta.push("proyecto");
  if (c.concepto_id == null) falta.push("concepto");
  return falta;
}

export type Herencia = { proyecto_id: number | null; area_id: number | null; solicitante: string };

/**
 * Con qué arranca una fila nueva, para no volver a elegir lo mismo en cada
 * comprobante: el proyecto, el área y el solicitante de la última fila que se
 * llenó. En un memo, área y solicitante son siempre los de quien viajó.
 */
export function herencia(
  filas: { proyecto_id: number | null; area_id: number | null; solicitante: string; descartado: boolean }[],
  tipo: "memo" | "caja",
  persona: { nombre: string; area_id: number | null },
  /** El proyecto del memo de entrega: con él arranca la primera fila. */
  proyectoDelMemo: number | null = null,
): Herencia {
  const ultima = [...filas].reverse().find((f) => !f.descartado && (f.proyecto_id != null || f.area_id != null || f.solicitante));
  if (tipo === "memo") {
    return { proyecto_id: ultima?.proyecto_id ?? proyectoDelMemo, area_id: persona.area_id, solicitante: persona.nombre };
  }
  return { proyecto_id: ultima?.proyecto_id ?? null, area_id: ultima?.area_id ?? null, solicitante: ultima?.solicitante ?? "" };
}

const CORTOS: Record<string, string> = {
  FACTURA: "Factura",
  RHE: "Rec. honorarios",
  BOLETA: "Boleta",
  PLANILLA_MOVILIDAD: "Planilla movilidad",
  VOUCHER: "Voucher",
  TICKET: "Ticket",
  RECIBO: "Recibo",
  DJ: "Decl. jurada",
  NOTA_CREDITO: "Nota de crédito",
};

/** El nombre corto de un tipo, para fichas y celdas angostas. */
export const tipoCorto = (id: string | null, nombre?: string) => (id ? (CORTOS[id] ?? nombre ?? id) : "Sin tipo");

/** Las fechas del viaje de una entrega de viáticos (cualquiera puede faltar). */
export type Viaje = { viaje_desde: string | null; viaje_hasta: string | null };

/** El comprobante tiene fecha y cae antes o después del viaje. */
export function fueraDelViaje(fecha: string | null, viaje?: Viaje | null): boolean {
  if (!fecha || !viaje) return false;
  return Boolean((viaje.viaje_desde && fecha < viaje.viaje_desde) || (viaje.viaje_hasta && fecha > viaje.viaje_hasta));
}

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export type EstadoFila = {
  clave: "descartado" | "leyendo" | "fallido" | "observado" | "falta" | "repetido" | "fuera" | "listo";
  texto: string;
  detalle: string;
  /** Pide la atención de quien rinde antes de enviar. */
  porRevisar: boolean;
};

/** En qué está una fila, en el orden en que importa: lo que bloquea primero. */
export function estadoFila(
  c: FilaParaRevisar & { observacion?: string; via?: string | null },
  archivo?: { estado_lectura: string; error: string | null },
  repetido?: boolean,
  viaje?: Viaje | null,
): EstadoFila {
  if (c.descartado) return { clave: "descartado", texto: "Descartado", detalle: "", porRevisar: false };
  if (archivo && (archivo.estado_lectura === "pendiente" || archivo.estado_lectura === "procesando")) {
    return { clave: "leyendo", texto: "Leyendo…", detalle: "", porRevisar: false };
  }
  if (archivo?.estado_lectura === "fallido") {
    return { clave: "fallido", texto: "No se leyó", detalle: archivo.error ?? "", porRevisar: true };
  }
  if (c.observacion) return { clave: "observado", texto: "Observado", detalle: c.observacion, porRevisar: true };
  const f = faltan(c);
  if (f.length) {
    return { clave: "falta", texto: f.length === 1 ? `Falta ${f[0]}` : `Faltan ${f.length} datos`, detalle: f.join(", "), porRevisar: true };
  }
  if (repetido) return { clave: "repetido", texto: "Repetido", detalle: "Ya está en otra rendición", porRevisar: true };
  // Avisa, no bloquea: un taxi al aeropuerto la víspera es un gasto del viaje.
  if (fueraDelViaje(c.fecha, viaje)) {
    const periodo = [viaje?.viaje_desde && `del ${dia(viaje.viaje_desde)}`, viaje?.viaje_hasta && `al ${dia(viaje.viaje_hasta)}`].filter(Boolean).join(" ");
    return { clave: "fuera", texto: "Fuera del viaje", detalle: `El viaje fue ${periodo}`, porRevisar: true };
  }
  return { clave: "listo", texto: "Listo", detalle: c.via === "ia" ? "Leído por IA" : "", porRevisar: false };
}
