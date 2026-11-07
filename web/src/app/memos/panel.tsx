"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cuando } from "@/lib/fechas";
import { dinero, espera, useContextoMemos, useMemos, type Contexto, type Memo } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { IconoBuscar, IconoMas } from "../iconos";
import { ConSesion } from "../marco";
import { Aviso, botonPrincipal, campoSuelto } from "../piezas";
import { AvisoCorte, ChipEstado, ChipPago, Encabezado, Kpi } from "./piezas-memo";

export function PanelMemos() {
  return <ConSesion activo="memos">{(persona) => <Contenido persona={persona} />}</ConSesion>;
}

type Pestana = "todos" | "te-esperan" | "pendiente" | "observado" | "sin-cargo" | "borradores";

const PESTANAS: { clave: Pestana; texto: string }[] = [
  { clave: "todos", texto: "Todos" },
  { clave: "te-esperan", texto: "Te esperan" },
  { clave: "pendiente", texto: "Por aprobar" },
  { clave: "observado", texto: "Observados" },
  { clave: "sin-cargo", texto: "Sin cargo" },
  { clave: "borradores", texto: "Mis borradores" },
];

const POR_PAGINA = 30;

/**
 * Los filtros viven en la dirección: compartir el enlace muestra lo mismo.
 * Se escriben con history.replaceState (sin pedirle nada al servidor ni
 * llenar el historial), como hace INROCONTA.
 */
function leerFiltros() {
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const n = (k: string) => (q.get(k) && Number(q.get(k))) || null;
  const p = q.get("ver") as Pestana | null;
  return {
    pestana: p && PESTANAS.some((x) => x.clave === p) ? p : ("todos" as Pestana),
    empresa: n("empresa"),
    unidad: n("area"),
    texto: q.get("q") ?? "",
  };
}

function escribirFiltros(f: { pestana: Pestana; empresa: number | null; unidad: number | null; texto: string }) {
  const q = new URLSearchParams();
  if (f.pestana !== "todos") q.set("ver", f.pestana);
  if (f.empresa) q.set("empresa", String(f.empresa));
  if (f.unidad) q.set("area", String(f.unidad));
  if (f.texto.trim()) q.set("q", f.texto.trim());
  const s = q.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
}

function filtrar(m: Memo, p: Pestana, persona: Persona, ctx: Contexto | null): boolean {
  switch (p) {
    case "todos":
      return m.estado !== "borrador" || m.emisor_id === persona.id;
    case "te-esperan":
      return espera(m, persona, ctx?.permisos ?? null) !== null;
    case "pendiente":
      return m.estado === "pendiente";
    case "observado":
      return m.estado === "observado";
    case "sin-cargo":
      return m.estado === "aprobado" || m.estado === "enviado";
    case "borradores":
      return m.estado === "borrador" && m.emisor_id === persona.id;
  }
}

function Contenido({ persona }: { persona: Persona }) {
  const { memos, error } = useMemos();
  const { contexto, error: errorCtx } = useContextoMemos(persona.correo);
  const [inicial] = useState(leerFiltros);
  const [pestana, setPestana] = useState<Pestana>(inicial.pestana);
  const [empresa, setEmpresa] = useState<number | null>(inicial.empresa);
  const [unidad, setUnidad] = useState<number | null>(inicial.unidad);
  const [texto, setTexto] = useState(inicial.texto);
  const [pagina, setPagina] = useState(0);
  useEffect(() => escribirFiltros({ pestana, empresa, unidad, texto }), [pestana, empresa, unidad, texto]);

  const unidades = useMemo(() => new Map((contexto?.catalogos.unidades ?? []).map((u) => [u.id, u])), [contexto]);
  const tipos = useMemo(() => new Map((contexto?.catalogos.tipos ?? []).map((t) => [t.codigo, t])), [contexto]);

  const todos = memos ?? [];
  const empresasVisibles = [...new Set(todos.map((m) => m.empresa_id))]
    .map((id) => contexto?.catalogos.empresas.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const unidadesVisibles = [...new Set(todos.filter((m) => !empresa || m.empresa_id === empresa).map((m) => m.unidad_id))]
    .map((id) => unidades.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  const base = todos.filter((m) => (!empresa || m.empresa_id === empresa) && (!unidad || m.unidad_id === unidad));
  const q = texto.trim().toLowerCase();
  const lista = base
    .filter((m) => filtrar(m, pestana, persona, contexto))
    .filter(
      (m) =>
        !q ||
        [m.numero_visible, m.asunto, m.emisor_nombre, m.destinatario_nombre, m.destinatario_correo, tipos.get(m.tipo_codigo)?.nombre]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(q)),
    )
    .sort((a, b) => (b.emitido_en ?? b.creado_en).localeCompare(a.emitido_en ?? a.creado_en));

  const contar = (p: Pestana) => base.filter((m) => filtrar(m, p, persona, contexto)).length;
  const teEsperan = contar("te-esperan");
  const mes = new Date().toISOString().slice(0, 7);
  const delMes = base.filter((m) => m.emitido_en?.startsWith(mes));
  const enCurso = base.filter((m) => m.requiere_pago && ["aprobado", "enviado", "recibido"].includes(m.estado) && m.estado_pago !== "pagado");
  const montoEnCurso = enCurso.reduce((s, m) => s + (m.moneda === "PEN" ? Number(m.total) || 0 : 0), 0);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const visibles = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const puedeEmitir = (contexto?.permisos.emite.length ?? 0) > 0 || persona.es_administracion;

  return (
    <div className="space-y-4">
      <Encabezado titulo="Panel de memos" descripcion="Los memos de tus áreas, en orden de emisión. Cada área ve solo los suyos.">
        {puedeEmitir && (
          <Link href="/memos/emitir/" className={`inline-flex items-center gap-2 text-[13px] ${botonPrincipal}`}>
            <IconoMas className="h-4 w-4" />
            Emitir memo
          </Link>
        )}
      </Encabezado>

      {(error || errorCtx) && <Aviso>{error ?? errorCtx}</Aviso>}
      {contexto && !puedeEmitir && (
        <Aviso tono="info">
          Todavía no tienes un área para emitir memos. Ves los que te enviaron; para emitir, pide a administración que te agregue a tu área.
        </Aviso>
      )}

      {empresasVisibles.length > 1 && (
        <div role="tablist" aria-label="Empresa" className="inline-flex flex-wrap rounded-control border border-control bg-surface p-0.75">
          {[{ id: null as number | null, nombre: "Todas" }, ...empresasVisibles].map((e) => (
            <button
              key={e.id ?? "todas"}
              type="button"
              role="tab"
              aria-selected={empresa === e.id}
              onClick={() => {
                setEmpresa(e.id);
                setUnidad(null);
                setPagina(0);
              }}
              className={`rounded-segment px-3 py-1.5 text-[12.5px] font-semibold ${
                empresa === e.id ? "bg-ink text-on-fill" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <Kpi etiqueta="Te esperan" valor={memos ? teEsperan : <span className="hueco h-6.5 w-16" />} nota="aprobar, dar cargo o corregir" riesgo={teEsperan > 0} />
        <Kpi etiqueta="Emitidos este mes" valor={memos ? delMes.length : <span className="hueco h-6.5 w-16" />} nota="en lo que puedes ver" />
        <Kpi etiqueta="Por aprobar" valor={memos ? contar("pendiente") : <span className="hueco h-6.5 w-16" />} nota="esperan al jefe de área" />
        <Kpi etiqueta="Observados" valor={memos ? contar("observado") : <span className="hueco h-6.5 w-16" />} nota="esperan a quien emite" />
        <Kpi
          className="col-span-2 lg:col-span-1"
          etiqueta="Pagos en curso"
          valor={memos ? dinero(montoEnCurso, "PEN") : <span className="hueco h-6.5 w-28" />}
          nota={`${enCurso.length} memo${enCurso.length === 1 ? "" : "s"} aprobado${enCurso.length === 1 ? "" : "s"} sin pagar`}
        />
      </div>

      <AvisoCorte />

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-55 flex-1">
          <span className="sr-only">Buscar</span>
          <IconoBuscar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPagina(0);
            }}
            placeholder="Buscar N°, asunto, emisor o destinatario"
            className={`w-full pl-9 text-[13.5px] ${campoSuelto}`}
          />
        </label>
        <select
          aria-label="Área"
          value={unidad ?? ""}
          onChange={(e) => {
            setUnidad(e.target.value ? Number(e.target.value) : null);
            setPagina(0);
          }}
          className={`text-[13.5px] ${campoSuelto}`}
        >
          <option value="">Todas las áreas</option>
          {unidadesVisibles.map((u) => (
            <option key={u.id} value={u.id}>
              {u.empresa?.codigo ?? ""} · {u.nombre}
            </option>
          ))}
        </select>
      </div>

      <div role="tablist" aria-label="Qué memos ver" className="flex gap-1 overflow-x-auto border-b border-line no-scrollbar">
        {PESTANAS.map((p) => {
          const n = contar(p.clave);
          return (
            <button
              key={p.clave}
              type="button"
              role="tab"
              aria-selected={pestana === p.clave}
              onClick={() => {
                setPestana(p.clave);
                setPagina(0);
              }}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-semibold ${
                pestana === p.clave ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {p.texto}
              <span
                className={`rounded-full px-1.75 text-[11px] font-bold tabular-nums ${
                  p.clave === "te-esperan" && n > 0 ? "bg-danger text-on-fill" : pestana === p.clave ? "bg-primary text-on-fill" : "bg-surface-3 text-ink-2"
                }`}
              >
                {memos ? n : "·"}
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-card border border-control bg-surface">
        {!memos ? (
          <ul aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
                <span className="hueco h-4 w-28" />
                <span className="hueco h-4 flex-1" />
                <span className="hueco h-4 w-20" />
              </li>
            ))}
          </ul>
        ) : visibles.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-3">
            {todos.length === 0 ? "Todavía no hay memos que puedas ver." : "Ningún memo coincide con lo elegido."}
          </p>
        ) : (
          <table className="w-full border-collapse text-[13.5px]">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-control text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                <th className="px-5 py-3 font-semibold">N° de memo</th>
                <th className="py-3 pr-3 font-semibold">Asunto</th>
                <th className="py-3 pr-3 text-right font-semibold">Monto</th>
                <th className="py-3 pr-5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m) => {
                const u = unidades.get(m.unidad_id);
                const t = tipos.get(m.tipo_codigo);
                const mia = espera(m, persona, contexto?.permisos ?? null);
                return (
                  <tr key={m.id} className="block border-b border-line px-5 py-3.5 last:border-0 hover:bg-surface-2 md:table-row md:p-0">
                    <td className="block md:table-cell md:px-5 md:py-3.5 md:align-top">
                      <Link href={`/memos/memo/?id=${m.id}`} className="font-bold tabular-nums text-primary hover:underline">
                        {m.numero_visible ?? "Borrador"}
                      </Link>
                      <span className="block text-[11.5px] text-ink-3">
                        {u?.empresa?.codigo ?? ""} · {u?.nombre ?? ""}
                      </span>
                    </td>
                    <td className="block py-1 md:table-cell md:py-3.5 md:pr-3 md:align-top">
                      <span className="font-semibold text-ink">{m.asunto || "Sin asunto"}</span>
                      <span className="block text-[11.5px] text-ink-3">
                        {t?.nombre ?? m.tipo_codigo} · {m.emisor_nombre} · {cuando(m.emitido_en ?? m.creado_en)}
                      </span>
                    </td>
                    <td className="block whitespace-nowrap tabular-nums md:table-cell md:py-3.5 md:pr-3 md:text-right md:align-top">
                      {m.requiere_pago ? dinero(m.total, m.moneda) : <span className="text-ink-3">Sin pago</span>}
                    </td>
                    <td className="block pt-1.5 md:table-cell md:py-3.5 md:pr-5 md:align-top">
                      <span className="flex flex-wrap gap-1.5">
                        <ChipEstado estado={m.estado} />
                        <ChipPago estado={m.estado_pago} />
                        {mia && (
                          <span className="inline-flex rounded-full bg-danger px-2.5 py-1 text-[12.5px] font-semibold text-on-fill">
                            {mia === "aprobar" ? "Te toca aprobar" : mia === "cargo" ? "Te toca dar cargo" : "Te toca corregir"}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {lista.length > POR_PAGINA && (
        <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-2.5 text-[12.5px] text-ink-2">
          <span className="tabular-nums">
            {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, lista.length)} de {lista.length}
          </span>
          <span className="flex gap-1.5">
            <button
              type="button"
              disabled={pagina === 0}
              onClick={() => setPagina(pagina - 1)}
              className="rounded-row border border-control bg-surface px-3 py-1.5 font-semibold text-ink hover:bg-surface-2 disabled:border-transparent disabled:bg-disabled disabled:text-disabled-ink"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={pagina >= paginas - 1}
              onClick={() => setPagina(pagina + 1)}
              className="rounded-row border border-control bg-surface px-3 py-1.5 font-semibold text-ink hover:bg-surface-2 disabled:border-transparent disabled:bg-disabled disabled:text-disabled-ink"
            >
              Siguiente
            </button>
          </span>
        </nav>
      )}
    </div>
  );
}
