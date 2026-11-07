"use client";

import { FallaDeBase } from "./errores-de-base";
import { supabase } from "./supabase";
import type { Archivo, Caja, Catalogos, Comprobante, Rendicion } from "./tipos";

/**
 * Todo lo que la app le pide a la base, en un solo lugar. Cada función lanza
 * FallaDeBase con un mensaje ya listo para mostrar.
 */

function exigir<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error || data == null) throw new FallaDeBase(error as never);
  return data;
}

export async function leerCatalogos(): Promise<Catalogos> {
  const db = supabase();
  const [empresas, areas, proyectos, tipos, conceptos] = await Promise.all([
    db.from("empresas").select("id, nombre, activo").order("nombre"),
    db.from("areas").select("id, nombre, activo").order("orden"),
    db.from("proyectos").select("id, nombre, activo").order("nombre"),
    db.from("tipos_comprobante").select("id, nombre, sustenta, orden, activo").order("orden"),
    db.from("conceptos").select("id, nombre, categoria, subcategoria, activo").order("nombre"),
  ]);
  return {
    empresas: exigir(empresas),
    areas: exigir(areas),
    proyectos: exigir(proyectos),
    tipos: exigir(tipos),
    conceptos: exigir(conceptos),
  };
}

export type FilaResumen = Pick<
  Comprobante,
  "total" | "tipo_comprobante_id" | "descartado" | "fecha" | "numero" | "proyecto_id" | "concepto_id" | "moneda" | "observacion"
>;
export type RendicionConResumen = Rendicion & {
  comprobantes: FilaResumen[];
  caja: { numero: string } | null;
  responsable: { nombre: string; correo: string } | null;
};

/** Las rendiciones que quien está dentro puede ver: las suyas, o todas si es administración. */
export async function leerRendiciones(): Promise<RendicionConResumen[]> {
  const r = await supabase()
    .from("rendiciones")
    .select(
      "*, caja:cajas(numero), responsable:personas(nombre, correo), comprobantes(total, tipo_comprobante_id, descartado, fecha, numero, proyecto_id, concepto_id, moneda, observacion)",
    )
    .order("creado_en", { ascending: false });
  return exigir(r) as RendicionConResumen[];
}

export async function leerMisCajas(uid: string): Promise<Caja[]> {
  const r = await supabase()
    .from("cajas")
    .select("id, numero, empresa_id, area_id, administrador_id, monto_fondo, activa")
    .eq("administrador_id", uid)
    .eq("activa", true)
    .order("numero");
  return exigir(r);
}

export async function crearMemo(datos: {
  numero_memo: string;
  monto: number;
  fecha_solicitud: string;
  empresa_id: number;
  responsable_id: string;
  /** La persona del memo de entrega de viáticos de la plataforma: la base toma de ahí número, monto y a nombre de quién. */
  linea_entrega_id?: string;
}): Promise<string> {
  const r = await supabase()
    .from("rendiciones")
    .insert({ tipo: "memo", ...datos })
    .select("id")
    .single();
  return exigir(r).id;
}

/** El correlativo, el fondo y el responsable los pone la base desde la caja. */
export async function crearReposicion(caja: Caja, uid: string): Promise<string> {
  const r = await supabase()
    .from("rendiciones")
    .insert({
      tipo: "caja",
      caja_id: caja.id,
      empresa_id: caja.empresa_id,
      responsable_id: uid,
      monto: caja.monto_fondo,
    })
    .select("id")
    .single();
  return exigir(r).id;
}

export type DatosRendicion = {
  rendicion: Rendicion & { responsable: { nombre: string; correo: string } | null };
  caja: Caja | null;
  comprobantes: Comprobante[];
  archivos: Archivo[];
};

export async function leerRendicion(id: string): Promise<DatosRendicion> {
  const db = supabase();
  const [rendicion, comprobantes, archivos] = await Promise.all([
    db.from("rendiciones").select("*, responsable:personas(nombre, correo)").eq("id", id).single(),
    db.from("comprobantes").select("*").eq("rendicion_id", id).order("creado_en").order("pagina"),
    db.from("archivos").select("id, ruta, tipo_mime, estado_lectura, error").eq("rendicion_id", id),
  ]);
  const r = exigir(rendicion) as DatosRendicion["rendicion"];
  let caja: Caja | null = null;
  if (r.caja_id != null) {
    caja = exigir(await db.from("cajas").select("*").eq("id", r.caja_id).single()) as Caja;
  }
  return {
    rendicion: r,
    caja,
    comprobantes: exigir(comprobantes) as Comprobante[],
    archivos: exigir(archivos) as Archivo[],
  };
}

export type CambiosComprobante = Partial<
  Pick<
    Comprobante,
    | "fecha" | "tipo_comprobante_id" | "serie" | "numero" | "ruc" | "proveedor" | "proyecto_id"
    | "area_id" | "solicitante" | "concepto_id" | "descripcion" | "total" | "moneda" | "descartado"
    | "observacion"
  >
>;

export async function agregarComprobante(rendicion_id: string, inicial: CambiosComprobante): Promise<Comprobante> {
  const r = await supabase()
    .from("comprobantes")
    // client_id: si la red se corta después de guardar y se reintenta, la
    // base reconoce el mismo comprobante en vez de crear otro.
    .insert({ rendicion_id, client_id: crypto.randomUUID(), ...inicial })
    .select("*")
    .single();
  return exigir(r) as Comprobante;
}

export async function cambiarComprobante(id: string, cambios: CambiosComprobante): Promise<Comprobante> {
  const r = await supabase().from("comprobantes").update(cambios).eq("id", id).select("*").single();
  return exigir(r) as Comprobante;
}

export async function cambiarRendicion(
  id: string,
  cambios: Partial<Pick<Rendicion, "no_sustentan" | "fecha_solicitud" | "monto" | "numero_memo">>,
): Promise<Rendicion> {
  const r = await supabase().from("rendiciones").update(cambios).eq("id", id).select("*").single();
  return exigir(r) as Rendicion;
}

/** La base sube la versión y bloquea la edición hasta que administración la revise. */
export async function enviar(id: string): Promise<Rendicion> {
  const r = await supabase().from("rendiciones").update({ estado: "enviada" }).eq("id", id).select("*").single();
  return exigir(r) as Rendicion;
}

/** El mismo cambio a varias filas a la vez (asignar proyecto, descartar…). */
export async function cambiarComprobantes(ids: string[], cambios: CambiosComprobante): Promise<Comprobante[]> {
  const r = await supabase().from("comprobantes").update(cambios).in("id", ids).select("*");
  return exigir(r) as Comprobante[];
}

export type EntradaHistorial = {
  id: number;
  tabla: "rendiciones" | "comprobantes" | "archivos";
  fila: string;
  accion: "crear" | "cambiar";
  cambios: Record<string, unknown>;
  actor: string | null;
  en: string;
};

export async function leerHistorial(rendicionId: string): Promise<EntradaHistorial[]> {
  const r = await supabase()
    .from("historial")
    .select("id, tabla, fila, accion, cambios, actor, en")
    .eq("rendicion_id", rendicionId)
    .order("en", { ascending: false })
    .limit(300);
  return exigir(r) as EntradaHistorial[];
}

/** Comprobantes de esta rendición que también aparecen (mismo RUC y número) en otra. */
export async function leerRepetidos(rendicionId: string): Promise<Map<string, string>> {
  const r = await supabase()
    .from("comprobantes_repetidos")
    .select("id, repetido_en")
    .eq("rendicion_id", rendicionId);
  return new Map((exigir(r) as { id: string; repetido_en: string }[]).map((x) => [x.id, x.repetido_en]));
}

/** Nombres de personas por id. Quien no es administración solo se ve a sí mismo. */
export async function leerNombres(): Promise<Map<string, string>> {
  const r = await supabase().from("personas").select("id, nombre, correo");
  return new Map((exigir(r) as { id: string; nombre: string; correo: string }[]).map((p) => [p.id, p.nombre || p.correo]));
}

/** Administración devuelve una rendición con observaciones o la aprueba. */
export async function decidirRendicion(
  id: string,
  estado: "observada" | "aprobada",
  observacion: string,
): Promise<Rendicion> {
  const r = await supabase().from("rendiciones").update({ estado, observacion }).eq("id", id).select("*").single();
  return exigir(r) as Rendicion;
}
