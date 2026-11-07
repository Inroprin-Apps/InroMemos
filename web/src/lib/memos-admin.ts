"use client";

import { FallaDeBase } from "./errores-de-base";
import { supabase } from "./supabase";

/** Lo que administración configura de la plataforma de memos. */

export type UsuarioMemo = {
  correo: string;
  cargo: string;
  ver_kpis: boolean;
  interarea_todas: boolean;
  activo: boolean;
  unidades: number[];
};

export type Correlativo = { unidad_id: number; anio: number; ultimo: number };

function revisar(r: { error: unknown }) {
  if (r.error) throw new FallaDeBase(r.error as never);
}

export async function leerConfiguracion(): Promise<{ usuarios: UsuarioMemo[]; correlativos: Correlativo[] }> {
  const db = supabase();
  const [usuarios, miembros, correlativos] = await Promise.all([
    db.from("usuarios_memo").select("correo, cargo, ver_kpis, interarea_todas, activo").order("correo"),
    db.from("miembros_unidad").select("correo, unidad_id"),
    db.from("correlativos").select("unidad_id, anio, ultimo"),
  ]);
  for (const r of [usuarios, miembros, correlativos]) revisar(r);
  const porCorreo = new Map<string, number[]>();
  for (const m of miembros.data ?? []) porCorreo.set(m.correo, [...(porCorreo.get(m.correo) ?? []), m.unidad_id]);
  return {
    usuarios: (usuarios.data ?? []).map((u) => ({ ...u, unidades: porCorreo.get(u.correo) ?? [] })),
    correlativos: (correlativos.data ?? []) as Correlativo[],
  };
}

export async function guardarUnidad(
  id: number,
  cambios: { requiere_aprobacion?: boolean; jefe_correo?: string | null; suplente_correo?: string | null },
) {
  revisar(await supabase().from("unidades").update(cambios).eq("id", id));
}

export async function guardarSemilla(unidadId: number, anio: number, ultimo: number) {
  revisar(await supabase().from("correlativos").upsert({ unidad_id: unidadId, anio, ultimo }));
}

export async function agregarUsuario(correo: string) {
  revisar(await supabase().from("usuarios_memo").insert({ correo }));
}

export async function guardarUsuario(correo: string, cambios: Partial<Omit<UsuarioMemo, "correo" | "unidades">>) {
  revisar(await supabase().from("usuarios_memo").update(cambios).eq("correo", correo));
}

export async function ponerEnUnidad(correo: string, unidadId: number) {
  revisar(await supabase().from("miembros_unidad").insert({ correo, unidad_id: unidadId }));
}

export async function sacarDeUnidad(correo: string, unidadId: number) {
  revisar(await supabase().from("miembros_unidad").delete().eq("correo", correo).eq("unidad_id", unidadId));
}

// ---------------------------------------------------------------------------
// La copia de INROCONTA: cuándo se trajo y cuánto hay
// ---------------------------------------------------------------------------

export type Corrida = {
  id: number;
  job: string;
  iniciada_en: string;
  terminada_en: string | null;
  resultado: "OK" | "PARCIAL" | "ERROR" | null;
  filas: number | null;
  error: string | null;
};

export type EstadoInroconta = {
  ultimas: Record<"padron" | "ssco" | "sire", Corrida | null>;
  contribuyentes: number;
  ssco: number;
  sire: number;
};

export async function leerInroconta(): Promise<EstadoInroconta> {
  const db = supabase();
  const contar = async (tabla: string, filtro?: [string, boolean]) => {
    let q = db.from(tabla).select("*", { count: "exact", head: true });
    if (filtro) q = q.eq(filtro[0], filtro[1]);
    const r = await q;
    revisar(r);
    return r.count ?? 0;
  };
  const [corridas, contribuyentes, ssco, sire] = await Promise.all([
    db.from("corridas").select("id, job, iniciada_en, terminada_en, resultado, filas, error").like("job", "inroconta-%")
      .order("iniciada_en", { ascending: false }).limit(30),
    contar("contribuyentes"),
    contar("contribuyentes", ["ssco", true]),
    contar("sire_comprobantes"),
  ]);
  revisar(corridas);
  const ultima = (c: string) => ((corridas.data ?? []) as Corrida[]).find((x) => x.job === `inroconta-${c}`) ?? null;
  return { ultimas: { padron: ultima("padron"), ssco: ultima("ssco"), sire: ultima("sire") }, contribuyentes, ssco, sire };
}

/** Trae ahora padrón, SSCO y SIRE de INROCONTA (función «inroconta»). */
export async function traerDeInroconta(): Promise<Record<string, { filas?: number; error?: string }>> {
  const { data, error } = await supabase().functions.invoke("inroconta", { body: {} });
  if (error) {
    const cuerpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(cuerpo?.error ?? "No se pudo traer los datos de INROCONTA.");
  }
  return (data as { resultado: Record<string, { filas?: number; error?: string }> }).resultado;
}
