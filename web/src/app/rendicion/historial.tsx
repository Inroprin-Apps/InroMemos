"use client";

import { useEffect, useState } from "react";
import { numeroCompleto, tipoCorto } from "@/lib/comprobante";
import { leerHistorial, leerNombres, type EntradaHistorial } from "@/lib/datos";
import { cuando } from "@/lib/fechas";
import type { Persona } from "@/lib/sesion";
import type { Catalogos, Comprobante } from "@/lib/tipos";
import { IconoCerrar } from "../iconos";
import { Aviso } from "../piezas";

const CAMPOS: Record<string, string> = {
  fecha: "Fecha",
  tipo_comprobante_id: "Tipo",
  serie: "Serie",
  numero: "Número",
  ruc: "RUC",
  proveedor: "Proveedor",
  proyecto_id: "Proyecto",
  area_id: "Área",
  solicitante: "Solicitante",
  concepto_id: "Concepto",
  descripcion: "Descripción",
  total: "Total",
  moneda: "Moneda",
  descartado: "Descartado",
  observacion: "Observación",
  monto: "Monto",
  numero_memo: "N° de memo",
  fecha_solicitud: "Fecha de solicitud",
  no_sustentan: "Qué no sustenta",
  responsable_id: "Responsable",
};

const ESTADOS: Record<string, string> = {
  enviada: "Envió a administración",
  observada: "Observó la rendición",
  aprobada: "Aprobó la rendición",
  repuesta: "Marcó la caja como repuesta",
  liquidada: "Marcó el memo como liquidado",
};

/** Quién hizo qué y cuándo. La trazabilidad que pide administración, a la vista de todos. */
export function Historial({
  rendicionId,
  persona,
  filas,
  catalogos,
  onCerrar,
}: {
  rendicionId: string;
  persona: Persona;
  filas: Comprobante[];
  catalogos: Catalogos;
  onCerrar: () => void;
}) {
  const [entradas, setEntradas] = useState<EntradaHistorial[] | null>(null);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([leerHistorial(rendicionId), leerNombres()]).then(
      ([h, n]) => {
        if (!vigente) return;
        setEntradas(h);
        setNombres(n);
      },
      (e: Error) => vigente && setError(e.message),
    );
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => {
      vigente = false;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [rendicionId, onCerrar]);

  const quien = (actor: string | null) =>
    actor == null ? "Lectura automática" : actor === persona.id ? "Tú" : (nombres.get(actor) ?? "Administración");

  const nombre = (campo: string, v: unknown): string => {
    if (v == null || v === "") return "vacío";
    if (typeof v === "boolean") return v ? "sí" : "no";
    const de = (l: { id: number | string; nombre: string }[]) => l.find((x) => String(x.id) === String(v))?.nombre ?? String(v);
    if (campo === "proyecto_id") return de(catalogos.proyectos);
    if (campo === "area_id") return de(catalogos.areas);
    if (campo === "concepto_id") return de(catalogos.conceptos);
    if (campo === "tipo_comprobante_id") return tipoCorto(String(v));
    if (Array.isArray(v)) return v.map((x) => tipoCorto(String(x))).join(", ") || "nada";
    return String(v);
  };

  const filaDe = (id: string) => {
    const c = filas.find((f) => f.id === id);
    if (!c) return "un comprobante";
    return [tipoCorto(c.tipo_comprobante_id), numeroCompleto(c), c.proveedor].filter((x) => x && x !== "Sin tipo").join(" · ") || "un comprobante";
  };

  const describir = (e: EntradaHistorial): { que: string; detalle: string[] } | null => {
    if (e.tabla === "archivos") return e.accion === "crear" ? { que: "Subió una imagen", detalle: [] } : null;
    if (e.accion === "crear") {
      return e.tabla === "rendiciones"
        ? { que: "Creó la rendición", detalle: [] }
        : { que: e.actor == null ? `Encontró ${filaDe(e.fila)} en la imagen` : `Agregó ${filaDe(e.fila)}`, detalle: [] };
    }
    const cambios = Object.entries(e.cambios as Record<string, { antes: unknown; despues: unknown }>);
    const estado = cambios.find(([k]) => k === "estado");
    if (estado) return { que: ESTADOS[String(estado[1].despues)] ?? `Pasó a ${estado[1].despues}`, detalle: [] };
    const visibles = cambios.filter(([k]) => CAMPOS[k]);
    if (!visibles.length) return null;
    const detalle = visibles.map(([k, { antes, despues }]) => `${CAMPOS[k]}: ${nombre(k, antes)} → ${nombre(k, despues)}`);
    if (e.tabla === "rendiciones") return { que: "Cambió la rendición", detalle };
    return { que: e.actor == null ? `Leyó ${filaDe(e.fila)}` : `Cambió ${filaDe(e.fila)}`, detalle };
  };

  return (
    <div className="animar-velo fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onCerrar}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="historial-titulo"
        className="flex h-full w-full max-w-md flex-col bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="historial-titulo" className="text-lg font-bold text-ink">
            Historial de cambios
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-control p-2 text-ink-2 hover:bg-surface-2">
            <IconoCerrar />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <Aviso>{error}</Aviso>}
          {!entradas && !error && <p className="text-ink-3">Cargando…</p>}
          {entradas && (
            <ol className="space-y-4">
              {entradas.map((e) => {
                const d = describir(e);
                if (!d) return null;
                return (
                  <li key={e.id} className="border-l-2 border-line pl-3">
                    <p className="text-xs text-ink-3">
                      {cuando(e.en)} · {quien(e.actor)}
                    </p>
                    <p className="text-sm font-semibold text-ink">{d.que}</p>
                    {d.detalle.map((x) => (
                      <p key={x} className="text-[13px] text-ink-2">
                        {x}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
