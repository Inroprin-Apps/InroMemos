// La IA de los memos (Gemini, la misma clave que la lectura de comprobantes):
//
// - redactar: asunto y cuerpo de una vez, a partir de lo que la persona
//   quiere decir y de los hechos que pone el servidor (las líneas ya
//   validadas). Si la IA falla, la plantilla: nadie se queda bloqueado.
// - leer_sustento: lee un sustento (PDF o imagen) y cruza RUC, número y monto
//   con las líneas del memo. Deja lo leído y los avisos en memo_sustentos.
//
// Secretos: GEMINI_API_KEY (ya existe) y opcionalmente GEMINI_MODELO.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";
import {
  type Contexto,
  cruzar,
  ESQUEMA_REDACCION,
  ESQUEMA_SUSTENTO,
  type Leido,
  normalizarRedaccion,
  plantilla,
  PROMPT_SUSTENTO,
  promptRedaccion,
} from "./reglas.ts";

const MODELO = Deno.env.get("GEMINI_MODELO") || "gemini-3.1-flash-lite-preview";
const LEGIBLES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

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

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_BASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function gemini(partes: unknown[], esquema: unknown, temperatura: number): Promise<unknown> {
  const clave = Deno.env.get("GEMINI_API_KEY");
  if (!clave) throw new Error("Falta la clave de la IA en el servidor.");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
    body: JSON.stringify({
      contents: [{ role: "user", parts: partes }],
      generationConfig: { responseMimeType: "application/json", responseSchema: esquema, temperature: temperatura },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`La IA respondió ${r.status}.`);
  const j = await r.json();
  const texto = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return JSON.parse(texto);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { error: "Solo POST." });
  try {
    // Se consulta con la sesión de la persona: lo que no puede ver, no existe.
    const jwt = req.headers.get("Authorization") ?? "";
    const comoPersona = createClient(URL_BASE, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: jwt } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: quien } = await db.auth.getUser(jwt.replace(/^Bearer\s+/i, ""));
    if (!quien?.user) throw new Rechazo(401, "Tu sesión venció. Vuelve a entrar.");
    const cuerpo = await req.json();

    if (cuerpo.accion === "redactar") {
      const { data: m } = await comoPersona.from("memos").select("*").eq("id", String(cuerpo.memo_id)).maybeSingle();
      if (!m) throw new Rechazo(404, "No existe ese memo o no lo puedes ver.");
      if (m.emisor_id !== quien.user.id || !["borrador", "observado"].includes(m.estado)) {
        throw new Rechazo(403, "Solo quien emite redacta su memo mientras lo edita.");
      }
      const idea = String(cuerpo.idea ?? "").trim().slice(0, 500);
      if (idea.length < 3) throw new Rechazo(400, "Escribe en una frase qué quieres decir.");
      const [{ data: tipo }, { data: unidad }, { data: lineas }, { data: ejemplos }, { data: conceptos }] =
        await Promise.all([
          db.from("tipos_memo").select("nombre, familia").eq("codigo", m.tipo_codigo).single(),
          db.from("unidades").select("nombre, empresa:empresas(nombre)").eq("id", m.unidad_id).single(),
          db.from("lineas_pago").select("beneficiario, concepto_id, monto, moneda, serie, numero").eq("memo_id", m.id)
            .order("orden"),
          // Memos anteriores del mismo tipo y NORMALES (nunca reservados): estilo, no datos.
          db.from("memos").select("asunto, cuerpo").eq("tipo_codigo", m.tipo_codigo).eq("confidencialidad", "normal")
            .in("estado", ["aprobado", "enviado", "recibido"]).neq("id", m.id).order("emitido_en", { ascending: false })
            .limit(3),
          db.from("conceptos").select("id, nombre"),
        ]);
      const nombreConcepto = new Map((conceptos ?? []).map((c) => [c.id, c.nombre]));
      const ctx: Contexto = {
        idea,
        tipo: tipo?.nombre ?? m.tipo_codigo,
        familia: tipo?.familia ?? "",
        area: unidad?.nombre ?? "",
        empresa: (unidad?.empresa as { nombre?: string } | null)?.nombre ?? "",
        destinatario: m.destinatario_nombre || m.destinatario_correo,
        llevaPago: m.requiere_pago,
        reservado: m.confidencialidad !== "normal",
        lineas: (lineas ?? []).map((l) => ({
          beneficiario: l.beneficiario,
          concepto: nombreConcepto.get(l.concepto_id) ?? "",
          monto: Number(l.monto) || 0,
          moneda: l.moneda,
          comprobante: l.numero ? `${l.serie}-${l.numero}` : "",
        })),
        ejemplos: (ejemplos ?? []).map((e) => ({ asunto: e.asunto, cuerpo: String(e.cuerpo).slice(0, 800) })),
      };
      try {
        return responder(
          200,
          normalizarRedaccion(await gemini([{ text: promptRedaccion(ctx) }], ESQUEMA_REDACCION, 0.3), ctx),
        );
      } catch (e) {
        console.error("redactar", e);
        return responder(200, { ...plantilla(ctx), aviso: "La IA no respondió: se usó la plantilla base." });
      }
    }

    if (cuerpo.accion === "leer_sustento") {
      const { data: s } = await comoPersona.from("memo_sustentos").select("*").eq("id", String(cuerpo.sustento_id))
        .maybeSingle();
      if (!s) throw new Rechazo(404, "No existe ese sustento o no lo puedes ver.");
      if (!LEGIBLES.includes(s.tipo_mime)) return responder(200, { lectura: { avisos: [] }, leido: false });
      const { data: archivo } = await db.storage.from("sustentos").download(s.ruta);
      if (!archivo) throw new Rechazo(404, "No se encontró el archivo del sustento.");
      if (archivo.size > 15 * 1024 * 1024) return responder(200, { lectura: { avisos: ["Muy grande para leerlo."] } });
      const leido = await gemini(
        [{ text: PROMPT_SUSTENTO }, {
          inline_data: { mime_type: s.tipo_mime, data: encodeBase64(await archivo.arrayBuffer()) },
        }],
        ESQUEMA_SUSTENTO,
        0,
      ) as Leido;
      const { data: lineas } = await db.from("lineas_pago").select("orden, beneficiario_doc, serie, numero, monto")
        .eq("memo_id", s.memo_id);
      const lectura = {
        ...leido,
        avisos: cruzar(leido, (lineas ?? []).map((l) => ({ ...l, monto: Number(l.monto) || 0 }))),
        leido_en: new Date().toISOString(),
      };
      await db.from("memo_sustentos").update({ lectura }).eq("id", s.id);
      return responder(200, { lectura, leido: true });
    }
    throw new Rechazo(400, "Acción desconocida.");
  } catch (e) {
    if (e instanceof Rechazo) return responder(e.status, { error: e.message });
    console.error("ia", e);
    return responder(500, { error: (e as Error).message || "Algo salió mal con la IA." });
  }
});
