"use client";

import type { ReactNode } from "react";
import type { Persona } from "@/lib/sesion";
import { ConSesion, type Activo } from "./marco";
import { Aviso } from "./piezas";

/** El marco de las pantallas de administración: título, y nada para quien no lo es. */
export function PaginaAdmin({
  activo,
  titulo,
  descripcion,
  acciones,
  children,
}: {
  activo: Activo;
  titulo: string;
  descripcion: string;
  acciones?: ReactNode;
  children: (persona: Persona) => ReactNode;
}) {
  return (
    <ConSesion activo={activo}>
      {(persona) =>
        persona.es_administracion ? (
          <div className="space-y-5">
            <header className="flex flex-wrap items-end justify-between gap-3 md:pr-12">
              <div>
                <h1 className="text-[21px] font-extrabold text-ink">{titulo}</h1>
                <p className="mt-1 text-ink-2">{descripcion}</p>
              </div>
              {acciones}
            </header>
            {children(persona)}
          </div>
        ) : (
          <Aviso>Esta pantalla es solo para administración.</Aviso>
        )
      }
    </ConSesion>
  );
}

/** Un interruptor sí/no con su texto, para activo, administración, sustenta… */
export function Interruptor({
  activo,
  etiqueta,
  onCambiar,
  disabled,
}: {
  activo: boolean;
  etiqueta: string;
  onCambiar: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambiar(!activo)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:bg-disabled disabled:text-disabled-ink ${activo ? "bg-primary" : "bg-control"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-card transition-all ${activo ? "left-5.5" : "left-0.5"}`} />
    </button>
  );
}

export const tablaAdmin = "w-full border-collapse text-sm";
export const cabeceraAdmin = "bg-surface-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink-3";
