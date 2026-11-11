"use client";

import type { ReactNode } from "react";
import { soles } from "@/lib/cuentas";
import type { EstadoRendicion } from "@/lib/tipos";

/**
 * El color de un estado: solo un punto. La etiqueta es blanca con borde fino
 * y texto gris, para que la pantalla no se llene de colores; el punto dice
 * de qué se trata (gris, azul, verde, ámbar, rojo).
 */
export type Tono = "neutro" | "info" | "ok" | "aviso" | "peligro";

const PUNTO: Record<Tono, string> = {
  neutro: "bg-ink-3",
  info: "bg-primary",
  ok: "bg-success",
  aviso: "bg-warning-strong",
  peligro: "bg-danger",
};

export function Etiqueta({ tono, children, className = "" }: { tono: Tono; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] font-semibold text-ink-2 ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} />
      {children}
    </span>
  );
}

const ESTADOS: Record<EstadoRendicion, { texto: string; tono: Tono }> = {
  abierta: { texto: "En curso", tono: "info" },
  enviada: { texto: "Enviada a administración", tono: "aviso" },
  observada: { texto: "Observada", tono: "peligro" },
  aprobada: { texto: "Aprobada", tono: "ok" },
  repuesta: { texto: "Repuesta", tono: "ok" },
  liquidada: { texto: "Liquidada", tono: "ok" },
};

export function Estado({ estado }: { estado: EstadoRendicion }) {
  const e = ESTADOS[estado];
  return <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>;
}

/** Cuánto del monto se gastó. Pasado el 100 % se marca: hay reembolso. */
export function BarraConsumo({ gastado, monto, consumo }: { gastado: number; monto: number; consumo: number | null }) {
  const pasado = consumo != null && consumo > 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-2">
          <b className="text-ink">{soles(gastado)}</b> de {soles(monto)}
        </span>
        <span className={`font-semibold ${pasado ? "text-danger-strong" : "text-ink-2"}`}>
          {consumo == null ? "—" : `${consumo}%`}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Gastado del monto"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(consumo ?? 0, 100)}
      >
        <div
          className={`h-full rounded-full ${pasado ? "bg-danger" : "bg-primary"}`}
          style={{ width: `${Math.min(consumo ?? 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Aviso({ tono = "peligro", children }: { tono?: "peligro" | "aviso" | "info"; children: ReactNode }) {
  const clases = {
    peligro: "bg-danger-soft text-danger-strong",
    aviso: "bg-warning-soft text-warning-strong",
    info: "border border-line bg-surface-2 text-ink-2",
  }[tono];
  return (
    <p role="alert" className={`rounded-control px-4 py-3 text-sm ${clases}`}>
      {children}
    </p>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-control bg-surface p-4 sm:px-5.5 sm:py-5 ${className}`}>{children}</section>;
}

export const botonPrincipal =
  "rounded-control bg-primary px-4 py-2.5 font-semibold text-on-fill transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink";
export const botonSecundario =
  "rounded-control border border-control bg-surface px-4 py-2.5 font-medium text-ink-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink";
export const campo =
  "w-full rounded-control border border-control bg-surface px-3 py-2 text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:bg-surface-2 disabled:text-ink-2";

/** Un campo que no ocupa todo el ancho: para filtros en una misma línea. */
export const campoSuelto = campo.replace("w-full ", "");
