"use client";

import type { ReactNode } from "react";
import { soles } from "@/lib/cuentas";
import type { EstadoRendicion } from "@/lib/tipos";

/**
 * La etiqueta de un estado: el Chip de INROCONTA (pastilla de color suave,
 * texto en el tono fuerte). Una por estado, sin rellenos sólidos.
 */
export type Tono = "neutro" | "info" | "ok" | "aviso" | "peligro";

const CHIP: Record<Tono, string> = {
  neutro: "bg-surface-3 text-ink-2",
  info: "bg-primary-soft text-primary-strong",
  ok: "bg-success-soft text-success-strong",
  aviso: "bg-warning-soft text-warning-strong",
  peligro: "bg-danger-soft text-danger-strong",
};

export function Etiqueta({ tono, children, className = "" }: { tono: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${CHIP[tono]} ${className}`}>
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
    info: "bg-primary-soft text-primary-strong",
  }[tono];
  return (
    <p role="alert" className={`rounded-xl px-4 py-3 text-[13px] ${clases}`}>
      {children}
    </p>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-control bg-surface p-4 sm:px-5.5 sm:py-5 ${className}`}>{children}</section>;
}

// Botones y campos como los de INROCONTA (button.tsx y CONTROL): esquina de 9 px,
// 13 px, cinco estados (normal, encima, presionado, foco de teclado, apagado).
export const botonPrincipal =
  "rounded-[9px] bg-primary px-3.5 py-2 text-[13px] font-semibold text-on-fill transition-colors duration-100 hover:bg-primary-hover active:bg-primary-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink";
export const botonSecundario =
  "rounded-[9px] border border-control bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-ink";
export const campo =
  "w-full rounded-[9px] border border-control bg-surface px-2.5 py-2 text-[13.5px] text-ink outline-none focus:border-primary disabled:bg-disabled disabled:text-disabled-ink";

/** Un campo que no ocupa todo el ancho: para filtros en una misma línea. */
export const campoSuelto = campo.replace("w-full ", "");
