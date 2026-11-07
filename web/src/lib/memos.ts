"use client";

import { useSyncExternalStore } from "react";
import { FallaDeBase } from "./errores-de-base";
import { supabase } from "./supabase";

/**
 * La Plataforma de Memorandums vista desde la app. Las reglas (quién ve, quién
 * aprueba, cómo se numera) viven en la base: supabase/migrations/…_memos.sql.
 * Acá solo se lee, se escribe lo editable y se llaman las transiciones.
 */

export type EstadoMemo = "borrador" | "pendiente" | "observado" | "aprobado" | "enviado" | "recibido" | "anulado";
export type EstadoPago = "en_analisis" | "registrado" | "observado_analisis" | "programado" | "pagado";
export type Confidencialidad = "normal" | "restringido" | "confidencial";
export type ModoLineas = "detalle" | "agrupado_cc" | "por_documento" | "sin_pago";
export type FormaPago = "contado" | "adelanto" | "saldo" | "credito_factura";

export type Unidad = {
  id: number;
  empresa_id: number;
  codigo: string;
  nombre: string;
  requiere_aprobacion: boolean;
  jefe_correo: string | null;
  suplente_correo: string | null;
  activo: boolean;
  empresa: { nombre: string; codigo: string | null } | null;
};

export type TipoMemo = {
  codigo: string;
  familia: string;
  nombre: string;
  lleva_pago: boolean;
  modo_lineas: ModoLineas;
  agrupa_desde: number | null;
  pasa_analisis: boolean;
  confidencialidad: Confidencialidad;
  confirmado: boolean;
  activo: boolean;
};

export type Sustento = {
  id: number;
  tipo_codigo: string;
  documento: string;
  nivel: "obligatorio" | "condicional" | "recomendado";
  condicion: string;
  umbral: number | null;
};

export type Memo = {
  id: string;
  unidad_id: number;
  empresa_id: number;
  tipo_codigo: string;
  proyecto_id: number | null;
  anio: number | null;
  numero: number | null;
  numero_visible: string | null;
  id_tecnico: string | null;
  asunto: string;
  cuerpo: string;
  emisor_id: string;
  emisor_nombre: string;
  destinatario_correo: string;
  destinatario_nombre: string;
  copias: string[];
  estado: EstadoMemo;
  estado_pago: EstadoPago | null;
  confidencialidad: Confidencialidad;
  requiere_pago: boolean;
  total: number | string;
  moneda: "PEN" | "USD" | "EUR";
  version: number;
  ultima_observacion: string;
  aprobado_por: string | null;
  aprobado_en: string | null;
  codigo_sello: string | null;
  emitido_en: string | null;
  enviado_en: string | null;
  recibido_en: string | null;
  valoracion: number | null;
  motivo_anulacion: string;
  rendicion_id: string | null;
  drive_carpeta_id?: string | null;
  pdf_drive_id?: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type Linea = {
  id: string;
  memo_id: string;
  orden: number;
  empresa_pagadora_id: number | null;
  proyecto_id: number | null;
  beneficiario_doc: string;
  beneficiario: string;
  concepto_id: number | null;
  sede: string;
  observaciones: string;
  monto: number | string;
  moneda: "PEN" | "USD" | "EUR";
  forma_pago: FormaPago;
  pct_adelanto_saldo: number | string | null;
  dias_credito: number | null;
  tipo_comprobante: "" | "FT" | "BV" | "RH" | "OTRO";
  serie: string;
  numero: string;
  fecha_comprobante: string | null;
  /** Solo en la entrega de viáticos: el periodo del viaje. */
  viaje_desde: string | null;
  viaje_hasta: string | null;
  banco: string;
  cuenta: string;
  cci: string;
  estado_cuenta: string;
};

export type Evento = {
  id: number;
  tipo: string;
  estado_antes: EstadoMemo | null;
  estado_despues: EstadoMemo | null;
  actor_nombre: string;
  detalle: Record<string, unknown>;
  en: string;
};

export type Revision = { nivel: "error" | "aviso"; mensaje: string };

export type MisPermisos = {
  /** Las unidades donde emite. */
  emite: number[];
  /** Las unidades donde aprueba (jefe o suplente). */
  aprueba: number[];
  verKpis: boolean;
  /** Decide las cuentas bancarias nuevas o distintas. */
  verificaCuentas: boolean;
  /** Tesorería: registra el estado del pago. */
  registraPagos: boolean;
};

function exigir<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error || data == null) throw new FallaDeBase(error as never);
  return data;
}

// ---------------------------------------------------------------------------
// Catálogos y permisos
// ---------------------------------------------------------------------------

export type CatalogosMemo = {
  unidades: Unidad[];
  tipos: TipoMemo[];
  sustentos: Sustento[];
  empresas: { id: number; nombre: string; codigo: string | null; activo: boolean }[];
  proyectos: { id: number; nombre: string; activo: boolean }[];
  conceptos: { id: number; nombre: string; activo: boolean }[];
};

export async function leerCatalogosMemo(): Promise<CatalogosMemo> {
  const db = supabase();
  const [unidades, tipos, sustentos, empresas, proyectos, conceptos] = await Promise.all([
    db.from("unidades").select("*, empresa:empresas(nombre, codigo)").order("empresa_id").order("codigo"),
    db.from("tipos_memo").select("*").order("familia").order("nombre"),
    db.from("sustentos_tipo").select("id, tipo_codigo, documento, nivel, condicion, umbral").eq("activo", true),
    db.from("empresas").select("id, nombre, codigo, activo").order("nombre"),
    db.from("proyectos").select("id, nombre, activo").order("nombre"),
    db.from("conceptos").select("id, nombre, activo").order("nombre"),
  ]);
  return {
    unidades: exigir(unidades) as Unidad[],
    tipos: exigir(tipos) as TipoMemo[],
    sustentos: exigir(sustentos) as Sustento[],
    empresas: exigir(empresas),
    proyectos: exigir(proyectos),
    conceptos: exigir(conceptos),
  };
}

export async function leerMisPermisos(correo: string, unidades: Unidad[]): Promise<MisPermisos> {
  const db = supabase();
  const [miembro, usuario] = await Promise.all([
    db.from("miembros_unidad").select("unidad_id").eq("correo", correo),
    db.from("usuarios_memo").select("ver_kpis, verifica_cuentas, registra_pagos").eq("correo", correo).maybeSingle(),
  ]);
  const aprueba = unidades.filter((u) => u.jefe_correo === correo || u.suplente_correo === correo).map((u) => u.id);
  const emite = [...new Set([...exigir(miembro).map((m) => m.unidad_id as number), ...aprueba])];
  return {
    emite,
    aprueba,
    verKpis: Boolean(usuario.data?.ver_kpis),
    verificaCuentas: Boolean(usuario.data?.verifica_cuentas),
    registraPagos: Boolean(usuario.data?.registra_pagos),
  };
}

export async function leerDirectorio(): Promise<{ correo: string; nombre: string }[]> {
  return exigir(await supabase().rpc("directorio")) as { correo: string; nombre: string }[];
}

// ---------------------------------------------------------------------------
// Los memos visibles, compartidos entre la barra lateral y el panel
// ---------------------------------------------------------------------------

type Estado = { memos: Memo[] | null; error: string | null };
let actual: Estado = { memos: null, error: null };
let enCurso: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function avisar(nuevo: Estado) {
  actual = nuevo;
  oyentes.forEach((f) => f());
}

// Lo que el panel necesita de cada memo: todo menos el cuerpo, que es lo que
// más pesa y solo se lee al abrir uno («pedir menos», como INROCONTA).
const COLUMNAS_PANEL =
  "pdf_drive_id, drive_carpeta_id, id, unidad_id, empresa_id, tipo_codigo, proyecto_id, anio, numero, numero_visible, id_tecnico, asunto, emisor_id, emisor_nombre, destinatario_correo, destinatario_nombre, copias, estado, estado_pago, confidencialidad, requiere_pago, total, moneda, version, ultima_observacion, aprobado_por, aprobado_en, codigo_sello, emitido_en, enviado_en, recibido_en, valoracion, motivo_anulacion, rendicion_id, creado_en, actualizado_en";

/** Supabase entrega a lo más 1000 filas por pedido: se piden por páginas hasta la última. */
const PAGINA = 1000;

async function leerTodos(): Promise<Memo[]> {
  const todos: Memo[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await supabase()
      .from("memos")
      .select(COLUMNAS_PANEL)
      .order("creado_en", { ascending: false })
      .order("id")
      .range(desde, desde + PAGINA - 1);
    const filas = exigir(r) as unknown as Memo[];
    todos.push(...filas.map((m) => ({ ...m, cuerpo: "" })));
    if (filas.length < PAGINA) return todos;
  }
}

let leidoEn = 0;

export function recargarMemos(): Promise<void> {
  leidoEn = Date.now();
  enCurso = (async () => {
    try {
      avisar({ memos: await leerTodos(), error: null });
    } catch (e) {
      avisar({ ...actual, error: (e as Error).message });
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

// Lo que hacen otras personas (emitir, aprobar, dar cargo) llega sin recargar
// la página: al volver a la pestaña y cada minuto mientras está a la vista.
// Nunca más de una lectura cada 10 segundos.
const CADA = 60_000;
const MINIMO = 10_000;
let reloj: ReturnType<typeof setInterval> | null = null;

function refrescarSiToca() {
  if (document.visibilityState === "visible" && !enCurso && Date.now() - leidoEn >= MINIMO) recargarMemos();
}

function suscribir(f: () => void) {
  oyentes.add(f);
  if (!enCurso && (!actual.memos || Date.now() - leidoEn >= MINIMO)) recargarMemos();
  if (oyentes.size === 1) {
    document.addEventListener("visibilitychange", refrescarSiToca);
    window.addEventListener("focus", refrescarSiToca);
    reloj = setInterval(refrescarSiToca, CADA);
  }
  return () => {
    oyentes.delete(f);
    if (oyentes.size === 0) {
      document.removeEventListener("visibilitychange", refrescarSiToca);
      window.removeEventListener("focus", refrescarSiToca);
      if (reloj) clearInterval(reloj);
      reloj = null;
    }
  };
}

const sinDatos: Estado = { memos: null, error: null };
export const useMemos = (): Estado => useSyncExternalStore(suscribir, () => actual, () => sinDatos);

// ---------------------------------------------------------------------------
// Un memo
// ---------------------------------------------------------------------------

export async function leerMemo(id: string): Promise<{ memo: Memo; lineas: Linea[]; eventos: Evento[] }> {
  const db = supabase();
  const [memo, lineas, eventos] = await Promise.all([
    db.from("memos").select("*").eq("id", id).maybeSingle(),
    db.from("lineas_pago").select("*").eq("memo_id", id).order("orden").order("creado_en"),
    db.from("memo_eventos").select("id, tipo, estado_antes, estado_despues, actor_nombre, detalle, en").eq("memo_id", id).order("en"),
  ]);
  if (!memo.error && !memo.data) throw new Error("No existe ese memo o no lo puedes ver.");
  return { memo: exigir(memo) as Memo, lineas: exigir(lineas) as Linea[], eventos: exigir(eventos) as Evento[] };
}

export async function revisarMemo(id: string): Promise<Revision[]> {
  return exigir(await supabase().rpc("revisar_memo", { mid: id })) as Revision[];
}

export async function crearBorrador(datos: { unidad_id: number; tipo_codigo: string }): Promise<Memo> {
  const r = await supabase().from("memos").insert(datos).select().single();
  const memo = exigir(r) as Memo;
  recargarMemos();
  return memo;
}

export type CambiosMemo = Partial<
  Pick<Memo, "asunto" | "cuerpo" | "destinatario_correo" | "copias" | "proyecto_id" | "tipo_codigo" | "unidad_id">
>;

export async function guardarMemo(id: string, cambios: CambiosMemo): Promise<Memo> {
  return exigir(await supabase().from("memos").update(cambios).eq("id", id).select().single()) as Memo;
}

export async function agregarLinea(memoId: string, orden: number, empresaId: number, moneda: string): Promise<Linea> {
  const r = await supabase()
    .from("lineas_pago")
    .insert({ memo_id: memoId, orden, empresa_pagadora_id: empresaId, moneda })
    .select()
    .single();
  return exigir(r) as Linea;
}

export type CambiosLinea = Partial<Omit<Linea, "id" | "memo_id">>;

export async function guardarLinea(id: string, cambios: CambiosLinea): Promise<Linea> {
  return exigir(await supabase().from("lineas_pago").update(cambios).eq("id", id).select().single()) as Linea;
}

export async function quitarLinea(id: string): Promise<void> {
  const { error } = await supabase().from("lineas_pago").delete().eq("id", id);
  if (error) throw new FallaDeBase(error);
}

async function transicion(fn: string, args: Record<string, unknown>): Promise<Memo> {
  const memo = exigir(await supabase().rpc(fn, args)) as Memo;
  recargarMemos();
  return memo;
}

export const emitirMemo = (id: string) => transicion("emitir_memo", { mid: id });
export const aprobarMemo = (id: string) => transicion("aprobar_memo", { mid: id });
export const observarMemo = (id: string, comentario: string) => transicion("observar_memo", { mid: id, comentario });
export const anularMemo = (id: string, motivo: string) => transicion("anular_memo", { mid: id, motivo });
export const darCargo = (id: string, puntaje: number | null, comentario: string) =>
  transicion("dar_cargo", { mid: id, puntaje, comentario });
export const memoDesdeRendicion = (rendicionId: string, unidadId: number) =>
  transicion("memo_desde_rendicion", { rid: rendicionId, unidad: unidadId });

// ---------------------------------------------------------------------------
// Palabras
// ---------------------------------------------------------------------------

export const ESTADOS_MEMO: Record<EstadoMemo, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-surface-3 text-ink-2" },
  pendiente: { texto: "Pendiente de aprobación", clase: "bg-warning-soft text-warning-strong" },
  observado: { texto: "Observado", clase: "bg-danger-soft text-danger-strong" },
  aprobado: { texto: "Aprobado", clase: "bg-success-soft text-success-strong" },
  enviado: { texto: "Enviado", clase: "bg-primary-soft text-primary-strong" },
  recibido: { texto: "Recibido", clase: "bg-success-soft text-success-strong" },
  anulado: { texto: "Anulado", clase: "bg-surface-3 text-ink-2" },
};

export const ESTADOS_PAGO: Record<EstadoPago, string> = {
  en_analisis: "En análisis",
  registrado: "Registrado",
  observado_analisis: "Observado en análisis",
  programado: "Programado",
  pagado: "Pagado",
};

export const FORMAS_PAGO: Record<FormaPago, string> = {
  contado: "Contado",
  adelanto: "Adelanto",
  saldo: "Saldo",
  credito_factura: "Crédito factura",
};

export function dinero(monto: number | string, moneda: string): string {
  const n = Number(monto) || 0;
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${moneda === "USD" ? "US$" : moneda === "EUR" ? "€" : "S/"} ${s}`;
}

/** Lo que el memo espera de quien lo mira, para el panel y la barra. */
export function espera(
  m: Memo,
  yo: { id: string; correo: string },
  permisos: MisPermisos | null,
): "aprobar" | "cargo" | "corregir" | null {
  if (m.estado === "pendiente" && m.emisor_id !== yo.id && permisos?.aprueba.includes(m.unidad_id)) return "aprobar";
  if ((m.estado === "aprobado" || m.estado === "enviado") && m.destinatario_correo === yo.correo) return "cargo";
  if (m.estado === "observado" && m.emisor_id === yo.id) return "corregir";
  return null;
}

// ---------------------------------------------------------------------------
// Catálogos y permisos de quien está dentro: se leen una vez por sesión
// ---------------------------------------------------------------------------

export type Contexto = { catalogos: CatalogosMemo; permisos: MisPermisos };
type EstadoContexto = { contexto: Contexto | null; error: string | null };

let ctx: EstadoContexto = { contexto: null, error: null };
let ctxCorreo: string | null = null;
let ctxEnCurso: Promise<void> | null = null;
const ctxOyentes = new Set<() => void>();

export function recargarContexto(correo: string): Promise<void> {
  ctxCorreo = correo;
  ctxEnCurso = (async () => {
    try {
      const catalogos = await leerCatalogosMemo();
      const permisos = await leerMisPermisos(correo, catalogos.unidades);
      ctx = { contexto: { catalogos, permisos }, error: null };
    } catch (e) {
      ctx = { ...ctx, error: (e as Error).message };
    } finally {
      ctxEnCurso = null;
      ctxOyentes.forEach((f) => f());
    }
  })();
  return ctxEnCurso;
}

const sinContexto: EstadoContexto = { contexto: null, error: null };

export function useContextoMemos(correo: string): EstadoContexto {
  return useSyncExternalStore(
    (f) => {
      ctxOyentes.add(f);
      if ((!ctx.contexto || ctxCorreo !== correo) && !ctxEnCurso) recargarContexto(correo);
      return () => ctxOyentes.delete(f);
    },
    () => ctx,
    () => sinContexto,
  );
}

// ---------------------------------------------------------------------------
// La ficha SUNAT de un RUC, de la copia local de INROCONTA
// ---------------------------------------------------------------------------

export type Contribuyente = {
  ruc: string;
  razon_social: string | null;
  estado: string | null;
  condicion: string | null;
  buen_contribuyente: boolean | null;
  agente_retencion: boolean | null;
  ssco: boolean;
  ssco_resolucion: string | null;
};

export async function fichaRuc(ruc: string): Promise<Contribuyente | null> {
  if (!/^\d{11}$/.test(ruc)) return null;
  const { data } = await supabase()
    .from("contribuyentes")
    .select("ruc, razon_social, estado, condicion, buen_contribuyente, agente_retencion, ssco, ssco_resolucion")
    .eq("ruc", ruc)
    .maybeSingle();
  return (data as Contribuyente) ?? null;
}


// ---------------------------------------------------------------------------
// Funciones del servidor: IA, Drive (PDF y cuentas)
// ---------------------------------------------------------------------------

async function invocar<T>(funcion: string, cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(funcion, { body: cuerpo });
  if (error) {
    const detalle = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalle?.error ?? error.message ?? "No se pudo completar.");
  }
  return data as T;
}

export type Redaccion = { asunto: string; cuerpo: string; fuente: "IA" | "PLANTILLA"; aviso?: string };

/** Asunto y cuerpo de una vez, con la IA (o la plantilla si la IA no responde). */
export const redactar = (memoId: string, idea: string) => invocar<Redaccion>("ia", { accion: "redactar", memo_id: memoId, idea });

/** El PDF membretado y el legajo en Drive (también lo hace el reloj cada 5 minutos). */
export const publicarMemo = (memoId: string) =>
  invocar<{ publicado: boolean; pdf?: string }>("drive", { accion: "memo", memo_id: memoId }).catch(() => null);

export type CuentaVerificada = { banco: string; cuenta: string; cci: string; estado_cuenta: string };

/** La cuenta completa viaja solo hasta la función: vuelve enmascarada y con su estado. */
export const verificarCuenta = (lineaId: string, datos: { cuenta?: string; cci?: string; banco?: string }) =>
  invocar<CuentaVerificada>("drive", { accion: "verificar_cuenta", linea_id: lineaId, ...datos });

// ---------------------------------------------------------------------------
// Sustentos
// ---------------------------------------------------------------------------

export type MemoSustento = {
  id: string;
  memo_id: string;
  sustento_id: number | null;
  nombre: string;
  ruta: string;
  tipo_mime: string;
  tamano: number;
  descartado: boolean;
  drive_id: string | null;
  lectura: { avisos?: string[]; total?: number | null; ruc_emisor?: string | null; numero?: string | null };
  creado_en: string;
};

export async function leerSustentos(memoId: string): Promise<MemoSustento[]> {
  return exigir(
    await supabase().from("memo_sustentos").select("*").eq("memo_id", memoId).eq("descartado", false).order("creado_en"),
  ) as MemoSustento[];
}

export async function subirSustento(memoId: string, archivo: File, sustentoId: number | null): Promise<MemoSustento> {
  const limpio = archivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const ruta = `${memoId}/${crypto.randomUUID()}-${limpio}`;
  const subida = await supabase().storage.from("sustentos").upload(ruta, archivo, { contentType: archivo.type });
  if (subida.error) throw new Error(`No se pudo subir ${archivo.name}: ${subida.error.message}`);
  const fila = await supabase()
    .from("memo_sustentos")
    .insert({ memo_id: memoId, sustento_id: sustentoId, nombre: archivo.name.slice(0, 200), ruta, tipo_mime: archivo.type, tamano: archivo.size })
    .select()
    .single();
  return exigir(fila) as MemoSustento;
}

export async function descartarSustento(id: string): Promise<void> {
  const { error } = await supabase().from("memo_sustentos").update({ descartado: true }).eq("id", id);
  if (error) throw new FallaDeBase(error);
}

/** La IA lee el sustento y lo cruza con las líneas (RUC, número, monto). */
export const leerSustentoIA = (id: string) =>
  invocar<{ lectura: MemoSustento["lectura"] }>("ia", { accion: "leer_sustento", sustento_id: id });

export async function enlaceSustento(ruta: string): Promise<string> {
  const { data, error } = await supabase().storage.from("sustentos").createSignedUrl(ruta, 300);
  if (error || !data) throw new Error("No se pudo abrir el archivo.");
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Pago, rendición y DNI
// ---------------------------------------------------------------------------

export const registrarEstadoPago = (id: string, estado: EstadoPago, detalle: string) =>
  transicion("registrar_estado_pago", { mid: id, estado, detalle });

/** El tipo de memo que entrega viáticos antes del viaje; después se rinden con comprobantes. */
export const ENTREGA_VIATICOS = "RR-EVI";

/**
 * Una persona de una entrega de viáticos aprobada que me toca rendir: la mía,
 * o la de alguien sin cuenta en InroScan si yo emití el memo o soy su jefatura.
 */
export type MemoParaRendir = {
  linea_id: string;
  id: string;
  numero_visible: string;
  asunto: string;
  empresa_id: number;
  monto: number;
  moneda: string;
  beneficiario: string;
  beneficiario_doc: string;
  a_nombre_de_otro: boolean;
  viaje_desde: string | null;
  viaje_hasta: string | null;
};

export async function memosParaRendir(): Promise<MemoParaRendir[]> {
  return exigir(await supabase().rpc("memos_para_rendir")) as MemoParaRendir[];
}

export async function miDni(): Promise<string | null> {
  const { data } = await supabase().rpc("mi_dni");
  return (data as string | null) ?? null;
}

export async function guardarMiDni(dni: string): Promise<void> {
  const { error } = await supabase().rpc("guardar_mi_dni", { dni });
  if (error) throw new FallaDeBase(error);
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export type Kpis = {
  emitidos: number;
  anulados: number;
  pendientes: number;
  observados_alguna_vez: number;
  a_la_primera_pct: number | null;
  horas_aprobacion: number | null;
  horas_aprobacion_mediana: number | null;
  horas_cargo: number | null;
  cargo_en_meta_pct: number | null;
  meta_horas: number;
  valoracion: number | null;
  valoraciones: Record<string, number>;
  monto_pen: number;
  pagados: number;
  por_area: { area: string; empresa: string; emitidos: number; pendientes: number; observados: number; monto: number }[];
  por_semana: { semana: string; emitidos: number }[];
};

export async function leerKpis(desde: string, hasta: string): Promise<Kpis> {
  return exigir(await supabase().rpc("kpis_memos", { desde, hasta })) as Kpis;
}
