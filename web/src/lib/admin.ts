"use client";

import { FallaDeBase } from "./errores-de-base";
import { supabase } from "./supabase";
import type { Caja, Rendicion } from "./tipos";

/**
 * Lo que solo usa administración. Los permisos los pone la base: estas
 * funciones fallan (con un mensaje claro) si las llama otra persona.
 */

function exigir<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error || data == null) throw new FallaDeBase(error as never);
  return data;
}

export type PersonaCompleta = {
  id: string;
  correo: string;
  nombre: string;
  area_id: number | null;
  es_administracion: boolean;
  activo: boolean;
  creado_en: string;
};

export async function leerPersonas(): Promise<PersonaCompleta[]> {
  return exigir(
    await supabase().from("personas").select("id, correo, nombre, area_id, es_administracion, activo, creado_en").order("nombre"),
  );
}

export async function cambiarPersona(
  id: string,
  cambios: Partial<Pick<PersonaCompleta, "nombre" | "area_id" | "es_administracion" | "activo">>,
): Promise<PersonaCompleta> {
  return exigir(await supabase().from("personas").update(cambios).eq("id", id).select("*").single()) as PersonaCompleta;
}

export async function leerCajas(): Promise<Caja[]> {
  return exigir(await supabase().from("cajas").select("*").order("numero")) as Caja[];
}

export async function crearCaja(caja: Pick<Caja, "numero" | "empresa_id" | "area_id" | "administrador_id"> & { monto_fondo: number }): Promise<Caja> {
  return exigir(await supabase().from("cajas").insert(caja).select("*").single()) as Caja;
}

export async function cambiarCaja(
  id: number,
  cambios: Partial<Pick<Caja, "administrador_id" | "area_id" | "activa">> & { monto_fondo?: number },
): Promise<Caja> {
  return exigir(await supabase().from("cajas").update(cambios).eq("id", id).select("*").single()) as Caja;
}

export type TablaCatalogo = "proyectos" | "conceptos" | "areas" | "empresas" | "tipos_comprobante";

export async function crearEnCatalogo(tabla: TablaCatalogo, fila: Record<string, unknown>): Promise<void> {
  exigir(await supabase().from(tabla).insert(fila).select("id").single());
}

/**
 * Varios de una vez (pegados de una lista): entra lo que no estaba y se dice
 * cuántos ya existían. Para proyectos, áreas y empresas, que solo llevan nombre.
 */
export async function crearVariosEnCatalogo(
  tabla: "proyectos" | "areas" | "empresas",
  nombres: string[],
  existentes: string[],
): Promise<{ agregados: number; repetidos: number }> {
  const ya = new Set(existentes.map((n) => n.toUpperCase()));
  const nuevos = [...new Set(nombres)].filter((n) => !ya.has(n));
  if (nuevos.length) {
    const r = await supabase().from(tabla).insert(nuevos.map((nombre) => ({ nombre })));
    if (r.error) throw new FallaDeBase(r.error as never);
  }
  return { agregados: nuevos.length, repetidos: nombres.length - nuevos.length };
}

export async function cambiarEnCatalogo(tabla: TablaCatalogo, id: number | string, cambios: Record<string, unknown>): Promise<void> {
  exigir(await supabase().from(tabla).update(cambios).eq("id", id).select("id").single());
}

/** Cierra el ciclo: la caja quedó repuesta o el memo liquidado. */
export async function cerrarRendicion(r: Pick<Rendicion, "id" | "tipo">): Promise<Rendicion> {
  const estado = r.tipo === "caja" ? "repuesta" : "liquidada";
  return exigir(await supabase().from("rendiciones").update({ estado }).eq("id", r.id).select("*").single()) as Rendicion;
}

/** Cuántos comprobantes repetidos (mismo RUC y número en otra rendición) tiene cada rendición. */
export async function leerRepetidosPorRendicion(): Promise<Map<string, number>> {
  const filas = exigir(await supabase().from("comprobantes_repetidos").select("id, rendicion_id")) as { id: string; rendicion_id: string }[];
  const cuenta = new Map<string, Set<string>>();
  for (const f of filas) cuenta.set(f.rendicion_id, (cuenta.get(f.rendicion_id) ?? new Set()).add(f.id));
  return new Map([...cuenta].map(([k, v]) => [k, v.size]));
}

export type FilaReporte = {
  total: number | string | null;
  moneda: string;
  fecha: string | null;
  proyecto_id: number | null;
  area_id: number | null;
  concepto_id: number | null;
  tipo_comprobante_id: string | null;
  rendicion: { estado: string; tipo: string; responsable_id: string } | null;
};

/** Los comprobantes vigentes de un periodo, con el estado de su rendición. */
export async function leerParaReporte(desde: string, hasta: string): Promise<FilaReporte[]> {
  return exigir(
    await supabase()
      .from("comprobantes")
      .select("total, moneda, fecha, proyecto_id, area_id, concepto_id, tipo_comprobante_id, rendicion:rendiciones(estado, tipo, responsable_id)")
      .eq("descartado", false)
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ) as unknown as FilaReporte[];
}
