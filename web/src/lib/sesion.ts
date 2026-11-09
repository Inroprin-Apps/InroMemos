"use client";

import { useEffect, useState } from "react";
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

/** Quién está dentro, si alguien. Se actualiza solo al entrar o salir. */
export function useSesion(): Sesion {
  const [sesion, setSesion] = useState<Sesion>({ estado: "cargando" });

  useEffect(() => {
    const cliente = supabase();

    // El aviso del retorno se lee una vez y se saca de la URL: si no, una
    // recarga lo volvería a mostrar como si hubiera vuelto a fallar.
    let aviso = mensajeDeIngreso(paramsDeRetorno(window.location.href));
    if (aviso) window.history.replaceState(null, "", `${BASE_PATH}/`);

    let vigente = true;
    const mostrar = async (uid: string | null) => {
      if (!uid) {
        if (vigente) setSesion({ estado: "fuera", aviso });
        return;
      }
      const { data, error } = await cliente
        .from("personas")
        .select("id, correo, nombre, area_id, es_administracion")
        .eq("id", uid)
        .single();
      if (!vigente) return;
      // Sin señal no se sabe nada nuevo de la cuenta: se sigue con lo último
      // conocido para poder capturar igual. Cerrar la sesión acá dejaría a la
      // persona fuera justo cuando no puede volver a entrar.
      if (error && sinSenal(error)) {
        const guardada = leerGuardada(uid);
        if (guardada) {
          setSesion({ estado: "dentro", persona: guardada });
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
      setSesion({ estado: "dentro", persona: data });
    };

    // INITIAL_SESSION llega cuando el cliente terminó de arrancar, incluido el
    // canje del código que devuelve Google.
    const { data: escucha } = cliente.auth.onAuthStateChange((evento, s) => {
      if (evento === "INITIAL_SESSION" || evento === "SIGNED_IN" || evento === "SIGNED_OUT") {
        // Fuera del callback: llamar a Supabase desde adentro puede trabar el
        // candado de la sesión (lo advierte la documentación de supabase-js).
        setTimeout(() => mostrar(s?.user.id ?? null), 0);
      }
    });

    return () => {
      vigente = false;
      escucha.subscription.unsubscribe();
    };
  }, []);

  return sesion;
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
