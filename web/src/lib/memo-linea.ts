// La línea de tiempo de un memo, de la emisión al pago, como la de InroPay:
// lo que ya pasó (con fecha, quién y los días corridos entre pasos), las
// observaciones en el camino y lo que falta, con el siguiente paso marcado.
// Pura, para probarla sin base.

import type { EstadoPago, Evento, Memo } from "./memos";

export type Paso = {
  clave: string;
  titulo: string;
  fecha: string | null;
  quien?: string;
  detalle?: string;
  estado: "hecho" | "alerta" | "siguiente" | "pendiente";
};

export type Linea = {
  pasos: Paso[];
  /** Pasos del camino principal ya cumplidos, y cuántos son en total. */
  hechos: number;
  total: number;
  /** El próximo paso, en palabras; null si terminó (pagado, recibido sin pago o anulado). */
  siguiente: string | null;
};

const PAGO: { estado: EstadoPago; titulo: string }[] = [
  { estado: "en_analisis", titulo: "En análisis (Finanzas)" },
  { estado: "registrado", titulo: "Registrado en RG" },
  { estado: "programado", titulo: "Programado para pago" },
  { estado: "pagado", titulo: "Pagado" },
];

/** «3 h», «2 d»: lo que pasó entre dos momentos; null si no hay cómo saberlo. */
export function corrido(desde: string | null, hasta: string | null): string | null {
  if (!desde || !hasta) return null;
  const h = (new Date(hasta).getTime() - new Date(desde).getTime()) / 36e5;
  if (!(h >= 0)) return null;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `${Math.round(h)} h`;
  return `${Math.floor(h / 24)} d`;
}

export function lineaDeTiempo(m: Memo, eventos: Evento[]): Linea {
  const ev = [...eventos].sort((a, b) => a.en.localeCompare(b.en));
  const ultimo = (tipo: string) => ev.filter((e) => e.tipo === tipo).at(-1) ?? null;
  const emitido = ultimo("emitido");
  const automatico = Boolean(emitido?.detalle?.aprobado_por_emision);
  const aprobado = ultimo("aprobado");
  const pagos = ev.filter((e) => e.tipo === "pago");
  const momentoPago = (estado: EstadoPago) => pagos.filter((e) => e.detalle?.despues === estado).at(-1)?.en ?? null;

  // El camino principal, en orden. Cada paso sabe si ya ocurrió.
  const camino: (Omit<Paso, "estado"> & { hecho: boolean })[] = [
    { clave: "emitido", titulo: "Emitido", fecha: m.emitido_en, quien: m.emisor_nombre, hecho: Boolean(m.emitido_en) },
    {
      clave: "aprobado",
      titulo: automatico ? "Aprobado al emitir" : "Aprobado",
      fecha: m.aprobado_en,
      quien: automatico ? "lo emitió la jefatura" : aprobado?.actor_nombre || undefined,
      detalle: m.codigo_sello ? `código ${m.codigo_sello}` : undefined,
      hecho: Boolean(m.aprobado_en),
    },
    {
      clave: "enviado",
      titulo: "Enviado al destinatario",
      fecha: m.enviado_en,
      detalle: m.destinatario_nombre || m.destinatario_correo || undefined,
      hecho: Boolean(m.enviado_en) || m.estado === "recibido",
    },
    {
      clave: "recibido",
      titulo: "Cargo recibido",
      fecha: m.recibido_en,
      quien: m.destinatario_nombre || undefined,
      detalle: m.valoracion ? `valoró ${m.valoracion} de 5` : undefined,
      hecho: Boolean(m.recibido_en),
    },
  ];
  if (m.requiere_pago) {
    const alcanzado = m.estado_pago && m.estado_pago !== "observado_analisis" ? PAGO.findIndex((p) => p.estado === m.estado_pago) : -1;
    PAGO.forEach((p, i) =>
      camino.push({ clave: p.estado, titulo: p.titulo, fecha: momentoPago(p.estado), hecho: i <= alcanzado }),
    );
  }

  // Lo que pasó, en el orden en que pasó: pasos cumplidos y observaciones.
  const sinMarca = ({ hecho, ...p }: (typeof camino)[number]) => (void hecho, p);
  const pasados: Paso[] = camino.filter((p) => p.hecho).map((p) => ({ ...sinMarca(p), estado: "hecho" as const }));
  for (const e of ev) {
    if (e.tipo === "observado") {
      pasados.push({ clave: `obs-${e.id}`, titulo: "Observado", fecha: e.en, quien: e.actor_nombre || undefined, detalle: String(e.detalle?.comentario ?? "") || undefined, estado: "alerta" });
    } else if (e.tipo === "pago" && e.detalle?.despues === "observado_analisis") {
      pasados.push({ clave: `obs-pago-${e.id}`, titulo: "Observado en análisis", fecha: e.en, detalle: String(e.detalle?.detalle ?? "") || undefined, estado: "alerta" });
    } else if (e.tipo === "anulado") {
      pasados.push({ clave: "anulado", titulo: "Anulado", fecha: e.en, quien: e.actor_nombre || undefined, detalle: m.motivo_anulacion || undefined, estado: "alerta" });
    }
  }
  pasados.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));

  const hechos = camino.filter((p) => p.hecho).length;
  const terminado = m.estado === "anulado" || camino.every((p) => p.hecho);
  const faltan: Paso[] = terminado
    ? []
    : camino
        .filter((p) => !p.hecho)
        .map((p, i) => ({ ...sinMarca(p), fecha: null, estado: i === 0 ? ("siguiente" as const) : ("pendiente" as const) }));

  return {
    pasos: [...pasados, ...faltan],
    hechos,
    total: camino.length,
    siguiente: faltan[0]?.titulo ?? null,
  };
}

/** ¿El paso es del pago (InroPay, Tesorería) y no del documento? */
const esDelPago = (p: Paso) => PAGO.some((x) => x.estado === p.clave) || p.clave.startsWith("obs-pago-");

/** La línea en dos carriles, como el detalle del diseño de Franco: el documento y el pago. */
export function carriles(l: Linea): { documento: Paso[]; pago: Paso[] } {
  return { documento: l.pasos.filter((p) => !esDelPago(p)), pago: l.pasos.filter(esDelPago) };
}

/** Los tiempos del memo: desde la emisión hasta cada hito, y cuántas veces lo observaron. */
export function tiemposDelMemo(m: Memo, eventos: Evento[]) {
  const momento = (estado: EstadoPago) =>
    eventos
      .filter((e) => e.tipo === "pago" && e.detalle?.despues === estado)
      .map((e) => e.en)
      .sort()
      .at(-1) ?? null;
  return {
    aprobacion: corrido(m.emitido_en, m.aprobado_en),
    cargo: corrido(m.emitido_en, m.recibido_en),
    registro: m.requiere_pago ? corrido(m.emitido_en, momento("registrado")) : null,
    pago: m.requiere_pago ? corrido(m.emitido_en, momento("pagado")) : null,
    observaciones: eventos.filter((e) => e.tipo === "observado" || (e.tipo === "pago" && e.detalle?.despues === "observado_analisis")).length,
  };
}
