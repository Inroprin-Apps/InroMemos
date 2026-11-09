"use client";

import { useSyncExternalStore } from "react";
import { BASE_PATH } from "./base";
import { mensajeDeIngreso, paramsDeRetorno } from "./errores-de-ingreso";
import { supabase } from "./supabase";

export type Persona = {
  id: string;
  correo: string;
  nombre: string;
  area_id: number | null;
  es_administracion: boolean;
};

export type Sesion =
  | { estado: "cargando" }
  | { estado: "fuera"; aviso: string | null }
  | { estado: "dentro"; persona: Persona };

/**
 * Quién está dentro, si alguien. Se resuelve UNA vez por pestaña y todas las
 * pantallas la comparten: pasar de una a otra ya no vuelve a preguntar ni
 * muestra «Abriendo…» (era el corte entre módulos). Se actualiza sola al entrar
 * o salir.
 */
export function useSesion(): Sesion {
  return useSyncExternalStore(suscribir, () => actual, () => CARGANDO);
}

const CARGANDO: Sesion = { estado: "cargando" };
let actual: Sesion = CARGANDO;
const oyentes = new Set<() => void>();
let iniciada = false;

function poner(s: Sesion) {
  actual = s;
  oyentes.forEach((f) => f());
}

function suscribir(f: () => void) {
  oyentes.add(f);
  iniciar();
  return () => oyentes.delete(f);
}

function iniciar() {
  if (iniciada) return;
  iniciada = true;
  const cliente = supabase();

  // El aviso del retorno se lee una vez y se saca de la URL: si no, una
  // recarga lo volvería a mostrar como si hubiera vuelto a fallar.
  let aviso = mensajeDeIngreso(paramsDeRetorno(window.location.href));
  if (aviso) window.history.replaceState(null, "", `${BASE_PATH}/`);

  const mostrar = async (uid: string | null) => {
    if (!uid) {
      poner({ estado: "fuera", aviso });
      return;
    }
    const { data, error } = await cliente
      .from("personas")
      .select("id, correo, nombre, area_id, es_administracion")
      .eq("id", uid)
      .single();
    // Sin señal no se sabe nada nuevo de la cuenta: se sigue con lo último
    // conocido para poder capturar igual. Cerrar la sesión acá dejaría a la
    // persona fuera justo cuando no puede volver a entrar.
    if (error && sinSenal(error)) {
      const guardada = leerGuardada(uid);
      if (guardada) {
        poner({ estado: "dentro", persona: guardada });
        return;
      }
    }
    // Sin fila de persona (desactivada, o el alta falló) no hay nada que
    // mostrar: se cierra la sesión en vez de dejar una pantalla vacía. El
    // aviso se fija antes, porque el cierre dispara SIGNED_OUT y ese vuelve
    // a pintar la pantalla de ingreso con el aviso vigente.
    if (error || !data) {
      aviso = "Tu cuenta no está habilitada en INROMEMOS. Pídeselo a administración.";
      await cliente.auth.signOut();
      return;
    }
    guardar(data);
    // La misma persona de antes (un token renovado): nada que volver a pintar.
    if (actual.estado === "dentro" && JSON.stringify(actual.persona) === JSON.stringify(data)) return;
    poner({ estado: "dentro", persona: data });
  };

  // INITIAL_SESSION llega cuando el cliente terminó de arrancar, incluido el
  // canje del código que devuelve Google.
  cliente.auth.onAuthStateChange((evento, s) => {
    if (evento === "INITIAL_SESSION" || evento === "SIGNED_IN" || evento === "SIGNED_OUT") {
      // Fuera del callback: llamar a Supabase desde adentro puede trabar el
      // candado de la sesión (lo advierte la documentación de supabase-js).
      setTimeout(() => mostrar(s?.user.id ?? null), 0);
    }
  });
}

const CLAVE = "inroscan.persona";

const sinSenal = (e: { message?: string }) =>
  !navigator.onLine || /failed to fetch|networkerror|load failed/i.test(e.message ?? "");

function guardar(p: Persona) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    // sin almacenamiento: sin modo sin señal
  }
}

function leerGuardada(uid: string): Persona | null {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Persona | null;
    return p?.id === uid ? p : null;
  } catch {
    return null;
  }
}

export function entrar() {
  return supabase().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${BASE_PATH}/`,
      // hd es una sugerencia para la pantalla de Google, no un control: el
      // que rechaza otras cuentas es el trigger de la base.
      queryParams: { hd: "inroprin.com", prompt: "select_account" },
    },
  });
}

export function salir() {
  try {
    // En un equipo compartido no queda nada de la cuenta al salir.
    for (const k of Object.keys(localStorage)) if (k.startsWith("inroscan.") && !k.startsWith("inroscan.barra")) localStorage.removeItem(k);
  } catch {
    // nada que borrar
  }
  return supabase().auth.signOut();
}
