"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * La acogida de la plataforma: después de cada acción (emitir, aprobar,
 * observar, anular, dar cargo, enviar una rendición) se pregunta «¿cómo te
 * fue?» con cinco caritas y un comentario opcional. Nunca bloquea: se puede
 * cerrar, y la misma acción se pregunta como mucho una vez al día por equipo.
 */

export type Accion = "emitir" | "aprobar" | "observar" | "anular" | "dar_cargo" | "rendir" | "otro";

export type Pedido = { accion: Accion; memo_id?: string; rendicion_id?: string };

export const TEXTO_ACCION: Record<Accion, string> = {
  emitir: "emitir el memo",
  aprobar: "aprobar",
  observar: "observar",
  anular: "anular",
  dar_cargo: "dar el cargo",
  rendir: "enviar la rendición",
  otro: "esta acción",
};

let actual: Pedido | null = null;
const oyentes = new Set<() => void>();
const avisar = (p: Pedido | null) => {
  actual = p;
  oyentes.forEach((f) => f());
};

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const clave = (a: Accion) => `inroscan.valoro.${a}`;

export function pedirValoracion(p: Pedido) {
  try {
    if (localStorage.getItem(clave(p.accion)) === hoy()) return;
  } catch {
    // sin almacenamiento: se pregunta igual
  }
  avisar(p);
}

export function cerrarValoracion() {
  if (actual) {
    try {
      localStorage.setItem(clave(actual.accion), hoy());
    } catch {
      // nada
    }
  }
  avisar(null);
}

export async function valorar(p: Pedido, puntaje: number, comentario: string) {
  const { error } = await supabase()
    .from("valoraciones")
    .insert({ accion: p.accion, puntaje, comentario: comentario.slice(0, 500), memo_id: p.memo_id ?? null, rendicion_id: p.rendicion_id ?? null });
  if (error) throw new Error("No se pudo guardar tu valoración.");
}

export const usePedidoDeValoracion = () =>
  useSyncExternalStore(
    (f) => (oyentes.add(f), () => oyentes.delete(f)),
    () => actual,
    () => null,
  );
