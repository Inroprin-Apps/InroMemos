"use client";

import { useSyncExternalStore } from "react";
import { FallaDeBase } from "./errores-de-base";
import { recargarMemos } from "./memos";
import { supabase } from "./supabase";

/**
 * Solicitar un memo: cualquiera lo pide a un área; su jefatura (o quien emite
 * ahí) lo atiende y nace el borrador ya llenado, o la jefatura lo rechaza con
 * su motivo. La base decide quién ve y quién puede qué.
 */

export type EstadoSolicitud = "pendiente" | "aceptada" | "rechazada" | "cancelada";

export type Solicitud = {
  id: string;
  solicitante_id: string;
  solicitante_nombre: string;
  unidad_id: number;
  tipo_codigo: string | null;
  que: string;
  monto: number | string | null;
  moneda: "PEN" | "USD" | "EUR";
  beneficiario: string;
  beneficiario_doc: string;
  viaje_desde: string | null;
  viaje_hasta: string | null;
  origen: "memos" | "rendiciones";
  estado: EstadoSolicitud;
  motivo_rechazo: string;
  memo_id: string | null;
  atendida_en: string | null;
  creado_en: string;
};

export type NuevaSolicitud = Pick<Solicitud, "unidad_id" | "tipo_codigo" | "que" | "moneda" | "beneficiario" | "beneficiario_doc" | "viaje_desde" | "viaje_hasta" | "origen"> & {
  monto: number | null;
};

type Estado = { solicitudes: Solicitud[] | null; error: string | null };
let actual: Estado = { solicitudes: null, error: null };
let enCurso: Promise<void> | null = null;
let leidoEn = 0;
const oyentes = new Set<() => void>();

export function recargarSolicitudes(): Promise<void> {
  leidoEn = Date.now();
  enCurso = (async () => {
    const r = await supabase().from("solicitudes_memo").select("*").order("creado_en", { ascending: false }).limit(500);
    actual = r.error ? { ...actual, error: "No se pudieron leer las solicitudes." } : { solicitudes: r.data as Solicitud[], error: null };
    oyentes.forEach((f) => f());
    enCurso = null;
  })();
  return enCurso;
}

function suscribir(f: () => void) {
  oyentes.add(f);
  if (!enCurso && (!actual.solicitudes || Date.now() - leidoEn > 30_000)) recargarSolicitudes();
  return () => oyentes.delete(f);
}

export const useSolicitudes = (): Estado =>
  useSyncExternalStore(suscribir, () => actual, () => ({ solicitudes: null, error: null }));

function revisar(error: unknown) {
  if (error) throw new FallaDeBase(error as never);
}

export async function solicitarMemo(datos: NuevaSolicitud): Promise<void> {
  const { error } = await supabase().from("solicitudes_memo").insert(datos);
  revisar(error);
  await recargarSolicitudes();
}

/** Atenderla crea el borrador del memo: devuelve su id para abrirlo. */
export async function atenderSolicitud(id: string): Promise<string> {
  const { data, error } = await supabase().rpc("atender_solicitud", { sid: id });
  revisar(error);
  await Promise.all([recargarSolicitudes(), recargarMemos()]);
  return data as string;
}

export async function rechazarSolicitud(id: string, motivo: string): Promise<void> {
  const { error } = await supabase().rpc("rechazar_solicitud", { sid: id, motivo });
  revisar(error);
  await recargarSolicitudes();
}

export async function cancelarSolicitud(id: string): Promise<void> {
  const { error } = await supabase().rpc("cancelar_solicitud", { sid: id });
  revisar(error);
  await recargarSolicitudes();
}

export const ESTADOS_SOLICITUD: Record<EstadoSolicitud, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-warning-soft text-warning-strong" },
  aceptada: { texto: "Atendida", clase: "bg-success-soft text-success-strong" },
  rechazada: { texto: "Rechazada", clase: "bg-danger-soft text-danger-strong" },
  cancelada: { texto: "Cancelada", clase: "bg-surface-3 text-ink-2" },
};
