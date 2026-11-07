"use client";

import { BASE_PATH } from "./base";
import { FallaDeBase } from "./errores-de-base";
import { supabase } from "./supabase";

/**
 * La rendición en Drive, en la carpeta madre (función «drive»). Publicar
 * nunca bloquea a la persona: si Drive falla, la rendición igual quedó
 * enviada, y se vuelve a intentar en el próximo envío o aprobación.
 */

/** El cliente OAuth web de Google Cloud (público por diseño, como en el login). */
const CLIENT_ID = "951030676058-igp95ct69p03lcpt02vtjs79t5dmsrij.apps.googleusercontent.com";

async function llamar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke("drive", { body: cuerpo });
  if (!error) return data as T;
  const respuesta = (error as { context?: unknown }).context;
  if (respuesta instanceof Response) {
    const j = await respuesta.json().catch(() => null);
    throw new Error(j?.error ?? `Drive respondió ${respuesta.status}.`);
  }
  throw new Error("Sin conexión con el servidor.");
}

export type EstadoDrive = { conectado: boolean; cuenta?: string; carpeta?: string; enlace?: string };

/** El id de una carpeta a partir de su enlace de Drive (o el id suelto). Las unidades compartidas tienen 19 caracteres. */
export function idDeCarpeta(texto: string): string | null {
  const t = texto.trim();
  const id = t.match(/\/folders\/([\w-]+)/)?.[1] ?? t.match(/[?&]id=([\w-]+)/)?.[1] ?? t;
  return /^[\w-]{19,}$/.test(id) ? id : null;
}

export const estadoDrive = () => llamar<EstadoDrive>({ accion: "estado" });

/** Copia imágenes, genera hoja y PDF de la versión, y archiva si está aprobada. */
export function publicarEnDrive(rendicionId: string): Promise<void> {
  return llamar({ accion: "publicar", rendicion_id: rendicionId }).then(
    () => {},
    (e: Error) => console.warn("Drive:", e.message),
  );
}

export const retornoDrive = () => `${window.location.origin}${BASE_PATH}/drive/`;

/** A la pantalla de Google: acceso a Drive que no vence (se pide una vez). */
export function irAConectar(carpeta: string) {
  const estado = crypto.randomUUID();
  sessionStorage.setItem("inroscan.drive.estado", estado);
  sessionStorage.setItem("inroscan.drive.carpeta", carpeta);
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: retornoDrive(),
    response_type: "code",
    // Drive (legajos y bases de cuentas) y Gmail (avisos de los memos, desde esta cuenta).
    scope: "openid email https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    hd: "inroprin.com",
    state: estado,
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

/** Al volver de Google: el estado tiene que ser el que se mandó (nadie más inicia esto). */
export async function terminarConexion(code: string, estado: string): Promise<EstadoDrive> {
  const esperado = sessionStorage.getItem("inroscan.drive.estado");
  const carpeta = sessionStorage.getItem("inroscan.drive.carpeta");
  sessionStorage.removeItem("inroscan.drive.estado");
  sessionStorage.removeItem("inroscan.drive.carpeta");
  if (!esperado || esperado !== estado) throw new Error("La respuesta de Google no corresponde a este pedido. Vuelve a intentarlo.");
  return llamar<EstadoDrive>({ accion: "conectar", code, redirect_uri: retornoDrive(), carpeta });
}

export type Version = { numero: number; hoja_id: string | null; pdf_drive_id: string | null; generado_en: string };

export async function leerVersiones(rendicionId: string): Promise<Version[]> {
  const { data, error } = await supabase()
    .from("versiones")
    .select("numero, hoja_id, pdf_drive_id, generado_en")
    .eq("rendicion_id", rendicionId)
    .order("numero", { ascending: false });
  if (error) throw new FallaDeBase(error);
  return data ?? [];
}
