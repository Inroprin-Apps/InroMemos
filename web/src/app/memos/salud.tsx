"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { leerSalud, type Salud } from "@/lib/memos-admin";
import { useMemos, type Contexto } from "@/lib/memos";
import { supabase } from "@/lib/supabase";
import { IconoCerrar } from "../iconos";
import { Etiqueta } from "../piezas";

const HORA = 3600e3;

/**
 * Salud de la plataforma, como la pidió Franco: un panel lateral que se abre
 * con un botón (solo administración). Dice si algo se trabó: correos que no
 * salieron, tareas automáticas con error, memos sin PDF, cuentas por
 * verificar y lo que pasó la meta de atención.
 */
export function PanelSalud({ contexto, onCerrar }: { contexto: Contexto | null; onCerrar: () => void }) {
  const [s, setS] = useState<Salud | null>(null);
  const [cuentas, setCuentas] = useState<number | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [ahora] = useState(() => Date.now());
  const { memos } = useMemos();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    leerSalud().then(setS, () => setS(null));
    supabase()
      .from("cuentas_bancarias")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente")
      .then((r) => setCuentas(r.count ?? 0));
  }, []);

  const cerrar = () => {
    setSaliendo(true);
    setTimeout(onCerrar, 160);
  };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    panel.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = (contexto?.catalogos.parametros.meta_atencion_horas ?? 3) * HORA;
  const lista = memos ?? [];
  const sinPdf = lista.filter((m) => ["aprobado", "enviado", "recibido"].includes(m.estado) && !m.pdf_drive_id).length;
  const aprobarFuera = lista.filter((m) => m.estado === "pendiente" && ahora - Date.parse(m.actualizado_en) > meta).length;
  const cargoFuera = lista.filter(
    (m) => (m.estado === "aprobado" || m.estado === "enviado") && ahora - Date.parse(m.enviado_en ?? m.aprobado_en ?? m.actualizado_en) > meta,
  ).length;

  const fila = (texto: string, valor: number | null, malo: boolean, href?: string) => (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13.5px] text-ink-2">{href ? <Link href={href} className="hover:text-ink hover:underline">{texto}</Link> : texto}</span>
      {valor == null ? (
        <span className="hueco h-4 w-8" />
      ) : (
        <Etiqueta tono={malo && valor > 0 ? "peligro" : "ok"} className="tabular-nums">
          {valor}
        </Etiqueta>
      )}
    </li>
  );

  return (
    <>
      <div className={`fixed inset-0 z-30 bg-ink/30 ${saliendo ? "opacity-0 transition-opacity duration-150" : "animar-velo"}`} onClick={cerrar} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label="Salud de la plataforma"
        className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-card outline-none sm:w-105 ${saliendo ? "animar-panel-sale" : "animar-panel"}`}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold text-ink">Salud de la plataforma</h2>
            <p className="text-[12.5px] text-ink-3">Solo administración. Verde: en orden; rojo: hay algo que mirar.</p>
          </div>
          <button type="button" onClick={cerrar} aria-label="Cerrar" title="Cerrar (Esc)" className="flex h-8 w-8 items-center justify-center rounded-row text-ink-2 hover:bg-surface-2">
            <IconoCerrar className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">Memos</h3>
            <ul className="divide-y divide-line">
              {fila(`Por aprobar hace más de ${contexto?.catalogos.parametros.meta_atencion_horas ?? 3} h`, memos ? aprobarFuera : null, true, "/memos/?ver=pendiente")}
              {fila(`Sin cargo hace más de ${contexto?.catalogos.parametros.meta_atencion_horas ?? 3} h`, memos ? cargoFuera : null, true, "/memos/?ver=sin-cargo")}
              {fila("Aprobados sin PDF en Drive", memos ? sinPdf : null, true)}
              {fila("Cuentas bancarias por verificar", cuentas, true, "/memos/cuentas/")}
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">Correos</h3>
            <ul className="divide-y divide-line">
              {fila("Por salir", s ? s.pendientes : null, false)}
              {fila("Con error", s ? s.errores : null, true)}
            </ul>
            {s?.ultimoError && <p className="mt-1 text-[12.5px] text-danger-strong">Último error: {s.ultimoError}</p>}
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">Tareas automáticas</h3>
            {!s ? (
              <span className="hueco mt-2 block h-16 w-full" />
            ) : s.corridas.length === 0 ? (
              <p className="mt-1 text-[13px] text-ink-3">Todavía no corrió ninguna.</p>
            ) : (
              <ul className="divide-y divide-line text-[12.5px]">
                {s.corridas.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                    <span className="font-semibold text-ink">{c.job}</span>
                    <span className={c.resultado === "ERROR" ? "font-semibold text-danger-strong" : "text-ink-2"}>
                      {c.resultado ?? "corriendo"}
                      {c.filas != null ? ` · ${c.filas} filas` : ""}
                    </span>
                    <span className="ml-auto text-ink-3">
                      {new Date(c.iniciada_en).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {c.error && <span className="w-full text-danger-strong">{c.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
