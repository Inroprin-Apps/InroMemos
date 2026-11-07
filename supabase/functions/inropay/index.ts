// La puerta de InroPay (Apps Script) hacia los memos:
//
//   GET  /inropay              → la cola: una fila por línea de pago de los memos
//                                 aprobados que pasan a Análisis y Registro, con
//                                 los encabezados del RG (vista cola_inropay).
//   POST /inropay {memo, estado, detalle}
//                              → el estado del pago: en_analisis, registrado,
//                                 observado_analisis (vuelve al emisor), programado,
//                                 pagado (cierra la rendición de la que salió).
//   Las dos con «Authorization: Bearer <token de InroPay>».
//
//   POST /inropay {accion: "token"} con la sesión de administración
//                              → un token nuevo (se muestra una vez; se guarda su huella).
//
// La plataforma NO escribe en el RG: entrega los datos a Análisis y Registro,
// que escribe tras su veredicto.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { bearer, type EstadoPago, ESTADOS, idTecnicoDe, iguales, sha256, tokenNuevo } from "./reglas.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const responder = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

class Rechazo extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function esInroPay(req: Request): Promise<boolean> {
  const t = bearer(req.headers.get("Authorization"));
  if (!t) return false;
  const { data } = await db.from("integraciones").select("datos").eq("clave", "inropay").maybeSingle();
  const guardada = (data?.datos as { huella?: string } | null)?.huella;
  return !!guardada && iguales(await sha256(t), guardada);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") {
      if (!(await esInroPay(req))) throw new Rechazo(401, "Token de InroPay inválido.");
      const filas: unknown[] = [];
      for (let desde = 0;; desde += 1000) {
        const { data, error } = await db.from("cola_inropay").select("*").order("aprobado_en").range(
          desde,
          desde + 999,
        );
        if (error) throw new Error(error.message);
        filas.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return responder(200, { filas, leido_en: new Date().toISOString() });
    }
    if (req.method !== "POST") throw new Rechazo(405, "Solo GET o POST.");
    const cuerpo = await req.json().catch(() => ({}));

    if (cuerpo.accion === "token") {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: quien } = await db.auth.getUser(jwt);
      const { data: p } = quien?.user
        ? await db.from("personas").select("correo, es_administracion, activo").eq("id", quien.user.id).maybeSingle()
        : { data: null };
      if (!p?.activo || !p.es_administracion) throw new Rechazo(403, "Solo administración genera el token de InroPay.");
      const token = tokenNuevo();
      await db.from("integraciones").upsert({
        clave: "inropay",
        datos: { huella: await sha256(token), creado_por: p.correo, creado_en: new Date().toISOString() },
        actualizado_en: new Date().toISOString(),
      });
      return responder(200, { token });
    }

    if (!(await esInroPay(req))) throw new Rechazo(401, "Token de InroPay inválido.");
    const estado = String(cuerpo.estado ?? "") as EstadoPago;
    if (!ESTADOS.includes(estado)) throw new Rechazo(400, `Estado desconocido. Válidos: ${ESTADOS.join(", ")}.`);
    const idTecnico = idTecnicoDe(String(cuerpo.memo ?? cuerpo.id_linea ?? ""));
    if (!idTecnico) throw new Rechazo(400, "Falta el memo (id técnico, p. ej. INR|029-2026-FINANZAS).");
    const { data: m } = await db.from("memos").select("id").eq("id_tecnico", idTecnico).maybeSingle();
    if (!m) throw new Rechazo(404, `No existe el memo ${idTecnico}.`);
    const { data, error } = await db.rpc("registrar_estado_pago", {
      mid: m.id,
      estado,
      detalle: String(cuerpo.detalle ?? "").slice(0, 500),
    });
    if (error) throw new Rechazo(409, error.message);
    return responder(200, { memo: idTecnico, estado: data?.estado_pago, estado_memo: data?.estado });
  } catch (e) {
    if (e instanceof Rechazo) return responder(e.status, { error: e.message });
    console.error("inropay", e);
    return responder(500, { error: "Algo salió mal." });
  }
});
