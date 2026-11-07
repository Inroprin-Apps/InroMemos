// La copia local de lo que InroScan necesita de INROCONTA: padrón de RUC,
// lista SSCO y registro de compras (SIRE) con sus OC y si ya está en CONCAR.
//
// La llama administración (botón «Traer ahora» en Áreas y permisos de memos)
// o el reloj de la base una vez al día, con la llave del sistema. Cada
// conjunto deja su fila en `corridas`: es lo que muestra la salud del sistema.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   INROCONTA_URL    la dirección de la app de INROCONTA (Vercel)
//   INROCONTA_TOKEN  el token de la app «inroscan» (pnpm apps:token inroscan
//                    en INROCONTA; su SHA-256 va en APPS_DATOS_TOKENS de Vercel)

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  type Conjunto,
  CONJUNTOS,
  filaContribuyente,
  filaSire,
  filaSsco,
  leerConjunto,
  type PadronRow,
  type SireRow,
  type SscoRow,
  tandas,
} from "./datos.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

class Rechazo extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

const LLAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, LLAVE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Administración con sesión, o el reloj de la base con la llave del sistema. */
async function autorizar(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token && token === LLAVE) return;
  const { data: quien } = await db.auth.getUser(token);
  if (!quien?.user) throw new Rechazo(401, "Tu sesión venció. Vuelve a entrar.");
  const { data: p } = await db.from("personas").select("es_administracion, activo").eq("id", quien.user.id)
    .maybeSingle();
  if (!p?.activo || !p.es_administracion) throw new Rechazo(403, "Solo administración trae los datos de INROCONTA.");
}

async function guardar(conjunto: Conjunto, base: string, token: string): Promise<number> {
  if (conjunto === "padron") {
    const filas = (await leerConjunto<PadronRow>(fetch, base, token, "padron")).map(filaContribuyente)
      .filter((x) => x !== null)
      .map((x) => ({ ...x, actualizado_en: new Date().toISOString() }));
    for (const t of tandas(filas)) {
      const { error } = await db.from("contribuyentes").upsert(t, { onConflict: "ruc" });
      if (error) throw new Error(`No se pudo guardar el padrón: ${error.message}`);
    }
    return filas.length;
  }
  if (conjunto === "ssco") {
    const filas = (await leerConjunto<SscoRow>(fetch, base, token, "ssco")).map(filaSsco).filter((x) => x !== null);
    const { data, error } = await db.rpc("cargar_ssco", { filas });
    if (error) throw new Error(`No se pudo guardar la lista SSCO: ${error.message}`);
    return data as number;
  }
  const filas = (await leerConjunto<SireRow>(fetch, base, token, "sire")).map(filaSire)
    .filter((x) => x !== null)
    .map((x) => ({ ...x, actualizado_en: new Date().toISOString() }));
  for (const t of tandas(filas)) {
    const { error } = await db.from("sire_comprobantes").upsert(t, { onConflict: "proveedor_ruc,tipo,serie,numero" });
    if (error) throw new Error(`No se pudo guardar el SIRE: ${error.message}`);
  }
  return filas.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { error: "Solo POST." });
  try {
    await autorizar(req);
    const base = Deno.env.get("INROCONTA_URL");
    const token = Deno.env.get("INROCONTA_TOKEN");
    if (!base || !token) {
      throw new Rechazo(409, "Falta configurar INROCONTA_URL e INROCONTA_TOKEN en los secretos de Supabase.");
    }
    const cuerpo = await req.json().catch(() => ({}));
    const pedidos: Conjunto[] = Array.isArray(cuerpo.conjuntos)
      ? CONJUNTOS.filter((c) => cuerpo.conjuntos.includes(c))
      : [...CONJUNTOS];

    // Uno detrás de otro: a la vez se estorban (lección de INROCONTA).
    const resultado: Record<string, { filas?: number; error?: string }> = {};
    for (const conjunto of pedidos) {
      const { data: corrida } = await db.from("corridas").insert({ job: `inroconta-${conjunto}` }).select("id")
        .single();
      try {
        const filas = await guardar(conjunto, base, token);
        resultado[conjunto] = { filas };
        await db.from("corridas").update({ terminada_en: new Date().toISOString(), resultado: "OK", filas })
          .eq("id", corrida?.id);
      } catch (e) {
        const error = (e as Error).message;
        resultado[conjunto] = { error };
        await db.from("corridas").update({ terminada_en: new Date().toISOString(), resultado: "ERROR", error })
          .eq("id", corrida?.id);
      }
    }
    const fallaron = Object.values(resultado).filter((r) => r.error).length;
    return responder(fallaron === pedidos.length ? 502 : 200, { resultado });
  } catch (e) {
    if (e instanceof Rechazo) return responder(e.status, { error: e.message });
    console.error(e);
    return responder(500, { error: "Algo salió mal al traer los datos de INROCONTA." });
  }
});
