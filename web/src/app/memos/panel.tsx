"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { cuando } from "@/lib/fechas";
import { proximoCiclo, textoCorte, textoDia } from "@/lib/memo-reglas";
import {
  ESTADOS_MEMO,
  ESTADOS_PAGO,
  aprobarMemo,
  dinero,
  espera,
  memosLeidosEn,
  publicarMemo,
  recargarMemos,
  useContextoMemos,
  useMemos,
  type Contexto,
  type EstadoPago,
  type Memo,
} from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { IconoBajar, IconoBuscar, IconoCarpeta, IconoMas, IconoPulso, IconoReloj, IconoSincronizar } from "../iconos";
import { ConSesion, marcarPestanaPanel } from "../marco";
import { Aviso, botonPrincipal, botonSecundario, campoSuelto, Etiqueta } from "../piezas";
import { PanelLateral } from "./panel-lateral";
import { ChipEstado, ChipPago, ChipPropuesta, Encabezado } from "./piezas-memo";
import { PanelSalud } from "./salud";

export function PanelMemos() {
  return <ConSesion activo="memos">{(persona) => <Contenido persona={persona} />}</ConSesion>;
}

export type Pestana = "todos" | "te-esperan" | "pendiente" | "observado" | "sin-cargo" | "por-pagar" | "borradores" | "mios";

const PESTANAS: { clave: Pestana; texto: string }[] = [
  { clave: "todos", texto: "Todos" },
  { clave: "te-esperan", texto: "Te esperan" },
  { clave: "pendiente", texto: "Por aprobar" },
  { clave: "observado", texto: "Observados" },
  { clave: "sin-cargo", texto: "Sin cargo" },
  { clave: "por-pagar", texto: "Por pagar" },
  { clave: "borradores", texto: "Mis borradores" },
  { clave: "mios", texto: "Mis memos" },
];

/** En el teléfono, la bandeja del diseño de Franco: lo que hay que hacer con una mano. */
const BANDEJA_MOVIL: { clave: Pestana; texto: string }[] = [
  { clave: "pendiente", texto: "Por aprobar" },
  { clave: "sin-cargo", texto: "Dar cargo" },
  { clave: "mios", texto: "Mis memos" },
];

/** Estado del pago para filtrar: además de los de InroPay, «sin pago» y «aún no pasa». */
type FiltroPago = "" | "sin-pago" | "por-pasar" | EstadoPago;

const POR_PAGINA = 30;
const HORA = 3600e3;

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
    tipo: q.get("tipo") ?? "",
    pago: (q.get("pago") ?? "") as FiltroPago,
    mes: q.get("mes") ?? "",
  };
}
type Filtros = ReturnType<typeof leerFiltros>;

function escribirFiltros(f: Filtros) {
  const q = new URLSearchParams();
  if (f.pestana !== "todos") q.set("ver", f.pestana);
  if (f.empresa) q.set("empresa", String(f.empresa));
  if (f.unidad) q.set("area", String(f.unidad));
  if (f.texto.trim()) q.set("q", f.texto.trim());
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.pago) q.set("pago", f.pago);
  if (f.mes) q.set("mes", f.mes);
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
    case "por-pagar":
      return m.requiere_pago && ["aprobado", "enviado", "recibido"].includes(m.estado) && m.estado_pago !== "pagado";
    case "borradores":
      return m.estado === "borrador" && m.emisor_id === persona.id;
    case "mios":
      return m.emisor_id === persona.id && m.estado !== "anulado";
  }
}

function filtrarPago(m: Memo, f: FiltroPago): boolean {
  if (!f) return true;
  if (f === "sin-pago") return !m.requiere_pago;
  if (f === "por-pasar") return m.requiere_pago && !m.estado_pago && ["aprobado", "enviado", "recibido"].includes(m.estado);
  return m.estado_pago === f;
}

const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const mesLima = (iso: string) => diaLima(iso).slice(0, 7);

/** «Hoy · martes 11 de noviembre», como los encabezados de fecha del diseño de Franco. */
function tituloDia(dia: string, ahora = new Date()): string {
  const fecha = new Date(`${dia}T12:00:00-05:00`);
  const largo = fecha.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" });
  const hoy = diaLima(ahora.toISOString());
  const ayer = diaLima(new Date(ahora.getTime() - 24 * HORA).toISOString());
  return dia === hoy ? `Hoy · ${largo}` : dia === ayer ? `Ayer · ${largo}` : largo.charAt(0).toUpperCase() + largo.slice(1);
}

/** Pasó la meta de atención esperando aprobación o cargo: borde rojo. */
function vencido(m: Memo, metaHoras: number, ahora: number): boolean {
  const meta = metaHoras * HORA;
  if (m.estado === "pendiente") return ahora - Date.parse(m.actualizado_en) > meta;
  if (m.estado === "aprobado" || m.estado === "enviado") return ahora - Date.parse(m.enviado_en ?? m.aprobado_en ?? m.actualizado_en) > meta;
  return false;
}

const drive = (id: string, carpeta = false) => (carpeta ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`);

/** La lista filtrada, en CSV para Excel (con BOM, para que respete las tildes). */
function exportar(lista: Memo[], ctx: Contexto | null) {
  const unidades = new Map((ctx?.catalogos.unidades ?? []).map((u) => [u.id, u]));
  const tipos = new Map((ctx?.catalogos.tipos ?? []).map((t) => [t.codigo, t]));
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = [
    ["N° de memo", "Empresa", "Área", "Tipo", "Asunto", "Emisor", "Destinatario", "Monto", "Moneda", "Estado", "Pago", "Emitido"],
    ...lista.map((m) => {
      const u = unidades.get(m.unidad_id);
      return [
        m.numero_visible ?? "Borrador",
        u?.empresa?.nombre ?? "",
        u?.nombre ?? "",
        tipos.get(m.tipo_codigo)?.nombre ?? m.tipo_codigo,
        m.asunto,
        m.emisor_nombre,
        m.destinatario_nombre || m.destinatario_correo,
        m.requiere_pago ? Number(m.total).toFixed(2) : "",
        m.requiere_pago ? m.moneda : "",
        ESTADOS_MEMO[m.estado].texto,
        m.estado_pago ? ESTADOS_PAGO[m.estado_pago] : "",
        m.emitido_en ? diaLima(m.emitido_en) : "",
      ];
    }),
  ];
  const csv = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `memos-${diaLima(new Date().toISOString())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Contenido({ persona }: { persona: Persona }) {
  const { memos, error } = useMemos();
  const { contexto, error: errorCtx } = useContextoMemos(persona.correo);
  const [inicial] = useState(leerFiltros);
  const [pestana, setPestana] = useState<Pestana>(inicial.pestana);
  const [empresa, setEmpresa] = useState<number | null>(inicial.empresa);
  const [unidad, setUnidad] = useState<number | null>(inicial.unidad);
  const [texto, setTexto] = useState(inicial.texto);
  const [tipo, setTipo] = useState(inicial.tipo);
  const [pago, setPago] = useState<FiltroPago>(inicial.pago);
  const [mes, setMes] = useState(inicial.mes);
  const [pagina, setPagina] = useState(0);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [salud, setSalud] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState<Memo | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => escribirFiltros({ pestana, empresa, unidad, texto, tipo, pago, mes }), [pestana, empresa, unidad, texto, tipo, pago, mes]);
  // La barra lateral marca «Por aprobar», «Cargos pendientes» o «Seguimiento de pagos».
  useEffect(() => marcarPestanaPanel(pestana), [pestana]);
  useEffect(() => () => marcarPestanaPanel(null), []);
  // Los ítems del menú que llevan a una pestaña avisan sin recargar la página.
  useEffect(() => {
    const ir = (e: Event) => {
      setPestana((e as CustomEvent<Pestana>).detail);
      setPagina(0);
    };
    window.addEventListener("inromemos:pestana", ir);
    return () => window.removeEventListener("inromemos:pestana", ir);
  }, []);
  // «Sincronizado hace…» se mantiene al día.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const unidades = useMemo(() => new Map((contexto?.catalogos.unidades ?? []).map((u) => [u.id, u])), [contexto]);
  const tipos = useMemo(() => new Map((contexto?.catalogos.tipos ?? []).map((t) => [t.codigo, t])), [contexto]);
  const metaHoras = contexto?.catalogos.parametros.meta_atencion_horas ?? 3;

  const todos = memos ?? [];
  const empresasVisibles = [...new Set(todos.map((m) => m.empresa_id))]
    .map((id) => contexto?.catalogos.empresas.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const unidadesVisibles = [...new Set(todos.filter((m) => !empresa || m.empresa_id === empresa).map((m) => m.unidad_id))]
    .map((id) => unidades.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const tiposVisibles = [...new Set(todos.map((m) => m.tipo_codigo))]
    .map((c) => tipos.get(c))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const meses = [...new Set(todos.map((m) => mesLima(m.emitido_en ?? m.creado_en)))].sort().reverse();

  const base = todos.filter(
    (m) =>
      (!empresa || m.empresa_id === empresa) &&
      (!unidad || m.unidad_id === unidad) &&
      (!tipo || m.tipo_codigo === tipo) &&
      filtrarPago(m, pago) &&
      (!mes || mesLima(m.emitido_en ?? m.creado_en) === mes),
  );
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
  const mesActual = diaLima(new Date().toISOString()).slice(0, 7);
  const delMes = base.filter((m) => m.emitido_en && mesLima(m.emitido_en) === mesActual);
  const enCurso = base.filter((m) => m.requiere_pago && ["aprobado", "enviado", "recibido"].includes(m.estado) && m.estado_pago !== "pagado");
  const montoEnCurso = enCurso.reduce((s, m) => s + (m.moneda === "PEN" ? Number(m.total) || 0 : 0), 0);
  // Para el aviso del corte: lo que ya entra y lo que todavía tiene que aprobarse.
  const entran = base.filter((m) => m.requiere_pago && !m.estado_pago && ["aprobado", "enviado", "recibido"].includes(m.estado)).length;
  const porAprobarConPago = base.filter((m) => m.requiere_pago && m.estado === "pendiente").length;

  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const visibles = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const puedeEmitir = (contexto?.permisos.emite.length ?? 0) > 0 || persona.es_administracion;
  const cerrarPanel = useCallback(() => setAbierto(null), []);
  const cerrarSalud = useCallback(() => setSalud(false), []);
  const cerrarConfirmar = useCallback(() => setPorConfirmar(null), []);
  // ↑ ↓ en el panel lateral: el memo anterior o el siguiente de la lista filtrada.
  const mover = (paso: -1 | 1) => {
    const i = lista.findIndex((m) => m.id === abierto);
    const otro = lista[i + paso];
    if (!otro) return;
    setAbierto(otro.id);
    const j = lista.indexOf(otro);
    if (Math.floor(j / POR_PAGINA) !== pagina) setPagina(Math.floor(j / POR_PAGINA));
  };
  const elegir = (p: Pestana) => {
    setPestana(p);
    setPagina(0);
  };
  const sincronizar = async () => {
    setSincronizando(true);
    await recargarMemos();
    setAhora(Date.now());
    setSincronizando(false);
  };
  const aprobarYa = async (m: Memo) => {
    setFalla(null);
    try {
      await aprobarMemo(m.id);
      publicarMemo(m.id);
      await recargarMemos();
    } catch (e) {
      setFalla((e as Error).message);
    }
  };

  const leido = memosLeidosEn();
  const haceTexto = !leido ? "Sincronizando…" : ahora - leido < 60_000 ? "Sincronizado recién" : `Sincronizado hace ${Math.round((ahora - leido) / 60_000)} min`;
  const hayFiltros = Boolean(tipo || pago || mes || unidad || texto);

  // La página visible, agrupada por día de emisión.
  const grupos: { dia: string; memos: Memo[] }[] = [];
  for (const m of visibles) {
    const dia = diaLima(m.emitido_en ?? m.creado_en);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.memos.push(m);
    else grupos.push({ dia, memos: [m] });
  }

  return (
    <div className="space-y-3">
      <Encabezado titulo="Panel de memos" descripcion="Todas tus áreas, en orden de correlativo, con acceso directo al PDF y al legajo.">
        <span className="hidden items-center gap-1.5 text-[12.5px] font-semibold text-success-strong sm:inline-flex">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          {haceTexto}
        </span>
        {persona.es_administracion && (
          <button type="button" onClick={() => setSalud(true)} className={`hidden items-center gap-2 text-[13px] sm:inline-flex ${botonSecundario}`}>
            <IconoPulso className="h-4 w-4" />
            Salud
          </button>
        )}
        <button type="button" onClick={sincronizar} disabled={sincronizando} className={`hidden items-center gap-2 text-[13px] sm:inline-flex ${botonSecundario}`}>
          <IconoSincronizar className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
          Sincronizar
        </button>
        {puedeEmitir && (
          <Link href="/memos/emitir/" className={`hidden items-center gap-2 text-[13px] sm:inline-flex ${botonPrincipal}`}>
            <IconoMas className="h-4 w-4" />
            Emitir memo
          </Link>
        )}
      </Encabezado>

      {(error || errorCtx || falla) && <Aviso>{error ?? errorCtx ?? falla}</Aviso>}
      {contexto && !puedeEmitir && (
        <Aviso tono="info">
          {contexto.catalogos.parametros.solicitar_memo
            ? "Ves los memos que te enviaron. Para pedir uno, usa «Solicitar memo»: le llega a la jefatura del área y el área lo emite."
            : "Ves los memos que te enviaron. Para pedir uno, habla con quien emite memos en tu área."}
        </Aviso>
      )}

      {/* Teléfono: la bandeja de tres pestañas del diseño de Franco. */}
      <div role="tablist" aria-label="Bandeja" className="flex rounded-control border border-control bg-surface p-0.75 md:hidden">
        {BANDEJA_MOVIL.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            onClick={() => elegir(pestana === p.clave ? "todos" : p.clave)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-segment px-2 py-2 text-[12.5px] font-bold ${
              pestana === p.clave ? "bg-ink text-on-fill" : "text-ink-2"
            }`}
          >
            {p.texto}
            <span className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${pestana === p.clave ? "bg-on-fill/20" : "bg-surface-3"}`}>{memos ? contar(p.clave) : "·"}</span>
          </button>
        ))}
      </div>

      {empresasVisibles.length > 1 && (
        <div role="tablist" aria-label="Empresa" className="hidden flex-wrap rounded-control border border-control bg-surface p-0.75 md:inline-flex">
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

      {/* Lo que importa, en una franja compacta (lo pidió Franco): cada cifra lleva a su pestaña. */}
      <div className="hidden overflow-hidden rounded-card border border-control bg-surface md:flex">
        <div className="no-scrollbar flex flex-1 overflow-x-auto">
          <Cifra etiqueta="Te esperan" valor={memos ? teEsperan : null} riesgo={teEsperan > 0} onClick={() => elegir("te-esperan")} />
          <Cifra etiqueta="Por aprobar" valor={memos ? contar("pendiente") : null} onClick={() => elegir("pendiente")} />
          <Cifra etiqueta="Observados" valor={memos ? contar("observado") : null} onClick={() => elegir("observado")} />
          <Cifra etiqueta="Sin cargo" valor={memos ? contar("sin-cargo") : null} onClick={() => elegir("sin-cargo")} />
          <Cifra etiqueta="Este mes" valor={memos ? delMes.length : null} />
          <Cifra
            etiqueta={`Pagos en curso · ${enCurso.length}`}
            valor={memos ? dinero(montoEnCurso, "PEN") : null}
            onClick={contexto?.permisos.registraPagos || persona.es_administracion ? () => elegir("por-pagar") : undefined}
          />
        </div>
      </div>

      <Corte entran={memos ? entran : null} porAprobar={memos ? porAprobarConPago : null} />

      <div className="flex flex-wrap items-center gap-2">
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
            placeholder="Buscar N°, asunto, proveedor o emisor"
            className={`w-full pl-9 text-[13.5px] ${campoSuelto}`}
          />
        </label>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <Selector etiqueta="Período" valor={mes} onCambiar={(v) => (setMes(v), setPagina(0))} opciones={[["", "Todo el período"], ...meses.map((x) => [x, nombreMes(x)] as [string, string])]} />
          <Selector
            etiqueta="Área"
            valor={unidad ? String(unidad) : ""}
            onCambiar={(v) => (setUnidad(v ? Number(v) : null), setPagina(0))}
            opciones={[["", "Todas las áreas"], ...unidadesVisibles.map((u) => [String(u.id), `${u.empresa?.codigo ?? ""} · ${u.nombre}`] as [string, string])]}
          />
          <Selector etiqueta="Tipo" valor={tipo} onCambiar={(v) => (setTipo(v), setPagina(0))} opciones={[["", "Todos los tipos"], ...tiposVisibles.map((t) => [t.codigo, t.nombre] as [string, string])]} />
          <Selector
            etiqueta="Pago"
            valor={pago}
            onCambiar={(v) => (setPago(v as FiltroPago), setPagina(0))}
            opciones={[
              ["", "Toda ejecución"],
              ["por-pasar", "Aprobado, aún no pasa a InroPay"],
              ...(Object.keys(ESTADOS_PAGO) as EstadoPago[]).map((k) => [k, ESTADOS_PAGO[k]] as [string, string]),
              ["sin-pago", "Sin pago"],
            ]}
          />
          <button type="button" onClick={() => exportar(lista, contexto)} disabled={!lista.length} className={`inline-flex items-center gap-2 text-[13px] ${botonSecundario}`}>
            <IconoBajar className="h-4 w-4" />
            Excel
          </button>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                setTipo("");
                setPago("");
                setMes("");
                setUnidad(null);
                setPagina(0);
              }}
              className="px-1 text-[12.5px] font-semibold text-ink-2 hover:text-ink"
            >
              Quitar filtros
            </button>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Qué memos ver" className="hidden gap-1 overflow-x-auto border-b border-line no-scrollbar md:flex">
        {PESTANAS.filter((p) => p.clave !== "mios" && (p.clave !== "por-pagar" || contexto?.permisos.registraPagos || persona.es_administracion)).map((p) => {
          const n = contar(p.clave);
          return (
            <button
              key={p.clave}
              type="button"
              role="tab"
              aria-selected={pestana === p.clave}
              onClick={() => elegir(p.clave)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-semibold ${
                pestana === p.clave ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {p.texto}
              <span
                className={`rounded-full px-1.75 text-[11px] font-bold tabular-nums ${
                  pestana === p.clave ? "bg-ink text-on-fill" : p.clave === "te-esperan" && n > 0 ? "bg-danger-soft text-danger-strong" : "bg-surface-3 text-ink-2"
                }`}
              >
                {memos ? n : "·"}
              </span>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-card border border-control bg-surface">
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
                <th className="py-3 pr-4 text-right font-semibold">Monto</th>
                <th className="py-3 pr-3 font-semibold">Estado</th>
                <th className="py-3 pr-3 font-semibold">Pago</th>
                <th className="py-3 pr-4 font-semibold">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.dia}>
                  <tr className="block bg-surface-2 md:table-row">
                    <th colSpan={6} scope="colgroup" className="block border-b border-line px-5 py-1.5 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-3 md:table-cell">
                      {tituloDia(g.dia)}
                    </th>
                  </tr>
                  {g.memos.map((m) => (
                    <Fila
                      key={m.id}
                      m={m}
                      persona={persona}
                      contexto={contexto}
                      abierto={abierto === m.id}
                      vencido={vencido(m, metaHoras, ahora)}
                      ahora={ahora}
                      onAbrir={() => setAbierto(m.id)}
                      onAprobar={() => setPorConfirmar(m)}
                    />
                  ))}
                </Fragment>
              ))}
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

      {abierto && lista.some((m) => m.id === abierto) && (
        <PanelLateral resumen={lista.find((m) => m.id === abierto)!} contexto={contexto} onCerrar={cerrarPanel} onMover={(paso) => mover(paso)} />
      )}
      {salud && <PanelSalud contexto={contexto} onCerrar={cerrarSalud} />}
      {porConfirmar && <ConfirmarAprobacion m={porConfirmar} onAprobar={() => aprobarYa(porConfirmar)} onCerrar={cerrarConfirmar} />}
    </div>
  );
}

/** «5 h», «2 d»: cuánto lleva esperando. */
function espera_(desde: string | null, ahora: number): string | null {
  if (!desde) return null;
  const h = (ahora - Date.parse(desde)) / HORA;
  if (!(h >= 0)) return null;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 24 ? `${Math.round(h)} h` : `${Math.floor(h / 24)} d`;
}

/**
 * Una fila del panel. Estado: una pastilla y una línea gris; el rojo solo
 * para «fuera de meta». Lo que te toca es un botón a la derecha (Aprobar,
 * Dar cargo, Corregir); al lado, el legajo y el PDF. El resumen se abre con
 * un clic en la fila.
 */
function Fila({
  m,
  persona,
  contexto,
  abierto,
  vencido,
  ahora,
  onAbrir,
  onAprobar,
}: {
  m: Memo;
  persona: Persona;
  contexto: Contexto | null;
  abierto: boolean;
  vencido: boolean;
  ahora: number;
  onAbrir: () => void;
  onAprobar: () => void;
}) {
  const u = contexto?.catalogos.unidades.find((x) => x.id === m.unidad_id);
  const t = contexto?.catalogos.tipos.find((x) => x.codigo === m.tipo_codigo);
  const mia = espera(m, persona, contexto?.permisos ?? null);
  // Borde fino: ámbar si espera aprobación, rojo si pasó la meta (como Franco, más discreto).
  const borde = abierto ? "border-l-primary bg-primary-soft/40" : vencido ? "border-l-danger/70" : m.estado === "pendiente" ? "border-l-warning-strong/50" : "border-l-transparent";
  const ciclo = proximoCiclo(new Date(ahora));
  const corte = ciclo.corte.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", timeZone: "America/Lima" });

  // La línea gris bajo el estado: qué espera y desde cuándo.
  const lleva =
    m.estado === "pendiente" ? espera_(m.actualizado_en, ahora) : m.estado === "aprobado" || m.estado === "enviado" ? espera_(m.enviado_en ?? m.aprobado_en, ahora) : null;
  const nota =
    m.estado === "pendiente"
      ? "Espera aprobación"
      : m.estado === "observado"
        ? m.ultima_observacion
          ? `«${m.ultima_observacion}»`
          : "Vuelve a quien lo emitió"
        : m.estado === "aprobado" || m.estado === "enviado"
          ? "Espera el cargo"
          : m.estado === "recibido" && m.recibido_en
            ? `Cargo ${cuando(m.recibido_en)}`
            : null;

  const icono = "flex h-8 w-8 items-center justify-center rounded-[9px] text-ink-3 hover:bg-surface-2 hover:text-ink";
  // Botón chico de fila (el mediano de INROCONTA, un punto más compacto).
  const boton = "inline-flex items-center justify-center whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  const lleno = "bg-primary text-on-fill hover:bg-primary-hover active:bg-primary-active";
  const borde_ = "border border-control bg-surface text-ink hover:bg-surface-2 active:bg-surface-3";

  return (
    <tr
      tabIndex={0}
      aria-selected={abierto}
      title="Ver el resumen"
      onClick={onAbrir}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onAbrir()}
      className={`block cursor-pointer border-b border-l-2 border-b-line px-5 py-3 outline-none transition-colors duration-150 last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2 md:table-row md:p-0 ${borde}`}
    >
      <td className="block md:table-cell md:px-5 md:py-3 md:align-top">
        <Link href={`/memos/memo/?id=${m.id}`} onClick={(e) => e.stopPropagation()} className="font-bold tabular-nums text-primary hover:underline">
          {m.numero_visible ?? "Borrador"}
        </Link>
        <span className="block text-[11.5px] text-ink-3">
          {u?.empresa?.codigo ?? ""} · {u?.nombre ?? ""}
        </span>
      </td>
      <td className="block py-1 md:table-cell md:py-3 md:pr-3 md:align-top">
        <span className="font-semibold text-ink">{m.asunto || "Sin asunto"}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-ink-3">
          {t?.nombre ?? m.tipo_codigo}
          {t?.propuesto_inromemos && <ChipPropuesta />}
          <span>· {m.emisor_nombre}</span>
        </span>
      </td>
      <td className="block whitespace-nowrap tabular-nums md:table-cell md:py-3 md:pr-4 md:text-right md:align-top">
        {m.requiere_pago ? <span className="font-semibold text-ink">{dinero(m.total, m.moneda)}</span> : <span className="text-ink-3">Sin pago</span>}
      </td>
      <td className="block pt-1.5 md:table-cell md:py-3 md:pr-3 md:align-top">
        <ChipEstado estado={m.estado} />
        {nota && (
          <span className="mt-1 block max-w-60 truncate text-[11.5px] text-ink-3">
            {nota}
            {lleva && (vencido ? <span className="font-semibold text-danger-strong"> · {lleva}, fuera de meta</span> : ` · hace ${lleva}`)}
          </span>
        )}
      </td>
      <td className="block pt-1 md:table-cell md:py-3 md:pr-3 md:align-top">
        {!m.requiere_pago ? (
          <span className="hidden text-ink-3 md:inline">—</span>
        ) : m.estado_pago ? (
          <ChipPago estado={m.estado_pago} />
        ) : ["aprobado", "enviado", "recibido"].includes(m.estado) ? (
          <span className="text-[12px] font-semibold text-primary-strong">Entra al corte del {corte}</span>
        ) : (
          <span className="text-[12px] text-ink-3">Al aprobarse</span>
        )}
      </td>
      <td className="block pt-2 md:table-cell md:py-3 md:pr-4 md:align-top" onClick={(e) => e.stopPropagation()}>
        <span className="flex items-center gap-1 md:justify-end">
          {/* Lo que te toca, como botón: se hace desde aquí. */}
          {mia === "aprobar" && (
            <button type="button" onClick={onAprobar} className={`${boton} ${lleno}`}>
              Aprobar
            </button>
          )}
          {mia === "cargo" && (
            <Link href={`/memos/memo/?id=${m.id}`} className={`${boton} ${lleno}`}>
              Dar cargo
            </Link>
          )}
          {mia === "corregir" && (
            <Link href={`/memos/memo/?id=${m.id}`} className={`${boton} ${borde_}`}>
              Corregir
            </Link>
          )}
          {m.drive_carpeta_id && (
            <a href={drive(m.drive_carpeta_id, true)} target="_blank" rel="noreferrer" aria-label="Abrir el legajo en Drive" title="Legajo en Drive" className={icono}>
              <IconoCarpeta className="h-4 w-4" />
            </a>
          )}
          {m.pdf_drive_id && (
            <a href={drive(m.pdf_drive_id)} target="_blank" rel="noreferrer" aria-label="Descargar el PDF" title="PDF" className={icono}>
              <IconoBajar className="h-4 w-4" />
            </a>
          )}
        </span>
      </td>
    </tr>
  );
}

/** Antes de aprobar desde la lista: el número, el monto y el asunto, para no aprobar a ciegas. */
function ConfirmarAprobacion({ m, onAprobar, onCerrar }: { m: Memo; onAprobar: () => Promise<void>; onCerrar: () => void }) {
  const [aprobando, setAprobando] = useState(false);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return (
    <div className="animar-velo fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aprobar-titulo"
        className="animar-dialogo w-full max-w-md rounded-t-card bg-surface p-5 shadow-card sm:rounded-card sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="aprobar-titulo" className="text-lg font-bold text-ink">
          ¿Aprobar {m.numero_visible}?
        </h2>
        <dl className="mt-3 space-y-1.5 text-[13.5px]">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-ink-3">Asunto</dt>
            <dd className="min-w-0 font-semibold text-ink">{m.asunto || "Sin asunto"}</dd>
          </div>
          {m.requiere_pago && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-ink-3">Monto</dt>
              <dd className="font-semibold tabular-nums text-ink">{dinero(m.total, m.moneda)}</dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-ink-3">Emisor</dt>
            <dd className="text-ink">{m.emisor_nombre}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-ink-3">Para</dt>
            <dd className="text-ink">{m.destinatario_nombre || m.destinatario_correo || "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[12.5px] text-ink-2">
          Se sella y se envía al destinatario. Si quieres revisar las líneas o los sustentos antes,{" "}
          <Link href={`/memos/memo/?id=${m.id}`} className="font-semibold text-primary hover:underline">
            abre el memo
          </Link>
          ; ahí también puedes observarlo.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={aprobando}
            onClick={async () => {
              setAprobando(true);
              await onAprobar();
              onCerrar();
            }}
            className={`flex-1 ${botonPrincipal}`}
          >
            {aprobando ? "Aprobando…" : "Aprobar"}
          </button>
          <button type="button" onClick={onCerrar} className={botonSecundario}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

const nombreMes = (m: string) => {
  const t = new Date(`${m}-15T12:00:00-05:00`).toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "America/Lima" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Selector({ etiqueta, valor, onCambiar, opciones }: { etiqueta: string; valor: string; onCambiar: (v: string) => void; opciones: [string, string][] }) {
  return (
    <select aria-label={etiqueta} value={valor} onChange={(e) => onCambiar(e.target.value)} className={`max-w-56 text-[13px] ${campoSuelto}`}>
      {opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Una cifra de la franja; si lleva a una pestaña, es un botón. */
function Cifra({ etiqueta, valor, riesgo, onClick }: { etiqueta: string; valor: ReactNode | null; riesgo?: boolean; onClick?: () => void }) {
  const cuerpo = (
    <>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
        {riesgo && <span className="h-1.75 w-1.75 rounded-full bg-danger" aria-label="Hay algo que revisar" />}
        {etiqueta}
      </span>
      <span className="text-[17px] font-extrabold tabular-nums tracking-[-0.02em] text-ink">{valor ?? <span className="hueco h-5 w-10" />}</span>
    </>
  );
  const clase = "flex min-w-fit flex-1 shrink-0 flex-col gap-0.5 border-r border-line px-4 py-2.5 text-left last:border-r-0";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${clase} transition-colors duration-150 hover:bg-surface-2`}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

/** El próximo corte (lun/mié 16:00), su día de pago y cuántos memos entran. */
function Corte({ entran, porAprobar }: { entran: number | null; porAprobar: number | null }) {
  const c = proximoCiclo(new Date());
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-line bg-surface px-4 py-2.5 text-[12.5px] text-ink-2">
      <IconoReloj className="h-4 w-4 shrink-0 text-warning-strong" />
      <span>
        Próximo corte: <b className="font-semibold text-ink">{textoCorte(c.corte)}</b> · pago el {textoDia(c.pago)}
      </span>
      {entran != null && entran > 0 && (
        <Etiqueta tono="ok">
          {entran} {entran === 1 ? "memo entra" : "memos entran"} a tiempo
        </Etiqueta>
      )}
      {porAprobar != null && porAprobar > 0 && (
        <Etiqueta tono="aviso">
          {porAprobar} por aprobar antes del corte
        </Etiqueta>
      )}
    </p>
  );
}
