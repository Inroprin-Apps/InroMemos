// La rendición en Drive, dentro de la carpeta madre que elige administración.
//
// - conectar: administración conecta una cuenta de Google una vez y elige la
//   carpeta madre; se guarda su token de larga duración (tabla integraciones,
//   solo el sistema la lee).
// - estado: si hay conexión, con qué cuenta y en qué carpeta.
// - publicar: al enviar (y al reenviar) copia las imágenes nuevas a la carpeta
//   de la rendición y genera la hoja y el PDF de esa versión; al aprobar,
//   verifica cada copia y recién entonces borra la imagen de Supabase.
//
// Secretos (Supabase → Edge Functions → Secrets): GOOGLE_CLIENT_SECRET; y
// opcionalmente GOOGLE_CLIENT_ID.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { crypto as cripto } from "jsr:@std/crypto@1.0.5";
import { encodeHex } from "jsr:@std/encoding@1.0.10/hex";
import {
  canjearCodigo,
  correoDe,
  docDesdeHtml,
  Drive,
  enviarCorreo,
  ErrorDeGoogle,
  tokenDeAcceso,
  valoresDeHoja,
} from "./google.ts";
import { armarCorreo, mensajeCrudo } from "./correo.ts";
import { type Base, comparar, huella, identificador, leerBase, mascara, soloDigitos } from "./cuentas.ts";
import { htmlMemo, nombreCarpeta, rutaMemo } from "./memo.ts";
import {
  armarHoja,
  type Catalogos,
  type Comprobante,
  nombreDeImagen,
  type Rendicion,
  rutaDeCarpeta,
  titulo,
  xlsx,
} from "./hoja.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ||
  "951030676058-igp95ct69p03lcpt02vtjs79t5dmsrij.apps.googleusercontent.com";
/** Pasado esto, una versión que quedó a medio generar se puede volver a intentar. */
const PLAZO_MS = 5 * 60_000;
const CERRADAS = ["aprobada", "repuesta", "liquidada"];

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

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Conexion = {
  refresh_token: string;
  cuenta: string;
  carpeta_id: string;
  carpeta_nombre: string;
  /** La unidad compartida donde vive la carpeta madre, si vive en una. */
  unidad_id: string | null;
};

const enlaceDe = (id: string) => `https://drive.google.com/drive/folders/${id}`;

function secreto(): string {
  const s = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!s) throw new Rechazo(409, "Falta configurar GOOGLE_CLIENT_SECRET en los secretos de Supabase.");
  return s;
}

async function conexion(): Promise<Conexion | null> {
  const { data } = await db.from("integraciones").select("datos").eq("clave", "drive").maybeSingle();
  return (data?.datos as Conexion) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { error: "Solo POST." });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    // El reloj de la base (pg_cron) entra con su propio secreto.
    if (token && await esReloj(token)) {
      const cuerpo = await req.json().catch(() => ({}));
      if (cuerpo.accion === "pendientes") return responder(200, await pendientes());
      if (cuerpo.accion === "cuentas_sincronizar") return responder(200, await sincronizarCuentas());
      throw new Rechazo(400, "Acción desconocida.");
    }
    const { data: quien } = await db.auth.getUser(token);
    if (!quien?.user) throw new Rechazo(401, "Tu sesión venció. Vuelve a entrar.");
    const { data: persona } = await db.from("personas").select("es_administracion, activo").eq("id", quien.user.id)
      .maybeSingle();
    if (!persona?.activo) throw new Rechazo(403, "Tu cuenta no está habilitada.");
    const cuerpo = await req.json();

    if (cuerpo.accion === "estado") {
      if (!persona.es_administracion) throw new Rechazo(403, "Solo administración.");
      const c = await conexion();
      return responder(
        200,
        c
          ? { conectado: true, cuenta: c.cuenta, carpeta: c.carpeta_nombre, enlace: enlaceDe(c.carpeta_id) }
          : { conectado: false },
      );
    }

    if (cuerpo.accion === "conectar") {
      if (!persona.es_administracion) throw new Rechazo(403, "Solo administración conecta Drive.");
      if (!cuerpo.carpeta) throw new Rechazo(400, "Falta indicar la carpeta madre.");
      const t = await canjearCodigo(fetch, {
        code: String(cuerpo.code),
        redirect_uri: String(cuerpo.redirect_uri),
        client_id: CLIENT_ID,
        client_secret: secreto(),
      });
      if (!t.refresh_token) {
        throw new Rechazo(400, "Google no entregó un acceso duradero. Vuelve a conectar y acepta todos los permisos.");
      }
      const cuenta = await correoDe(fetch, t.access_token);
      const madre = await new Drive(fetch, t.access_token).carpetaMadre(String(cuerpo.carpeta));
      const datos: Conexion = {
        refresh_token: t.refresh_token,
        cuenta,
        carpeta_id: madre.id,
        carpeta_nombre: madre.name,
        unidad_id: madre.driveId,
      };
      const { error } = await db.from("integraciones").upsert({
        clave: "drive",
        datos,
        actualizado_en: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      return responder(200, { conectado: true, cuenta, carpeta: madre.name, enlace: enlaceDe(madre.id) });
    }

    if (cuerpo.accion === "publicar") {
      return responder(200, await publicar(String(cuerpo.rendicion_id), quien.user.id, !!persona.es_administracion));
    }
    if (cuerpo.accion === "memo") {
      return responder(200, await publicarMemo(String(cuerpo.memo_id), quien.user.id, !!persona.es_administracion));
    }
    if (cuerpo.accion === "verificar_cuenta") {
      return responder(200, await verificarCuenta(quien.user.id, cuerpo));
    }
    if (cuerpo.accion === "pendientes" || cuerpo.accion === "cuentas_sincronizar") {
      if (!persona.es_administracion) throw new Rechazo(403, "Solo administración.");
      return responder(200, cuerpo.accion === "pendientes" ? await pendientes() : await sincronizarCuentas());
    }
    throw new Rechazo(400, "Acción desconocida.");
  } catch (e) {
    const mensaje = (e as Error).message || "Error desconocido.";
    if (e instanceof Rechazo) return responder(e.status, { error: mensaje });
    console.error("drive", e);
    return responder(e instanceof ErrorDeGoogle ? 502 : 500, { error: mensaje });
  }
});

async function publicar(rendicionId: string, uid: string, esAdmin: boolean) {
  const { data: r } = await db
    .from("rendiciones")
    .select("*, caja:cajas(numero), responsable:personas(nombre, correo)")
    .eq("id", rendicionId)
    .maybeSingle();
  if (!r) throw new Rechazo(404, "No existe esa rendición.");
  if (r.responsable_id !== uid && !esAdmin) throw new Rechazo(403, "No tienes permiso sobre esa rendición.");
  if (r.estado === "abierta") throw new Rechazo(409, "Se publica en Drive al enviarla.");

  const c = await conexion();
  if (!c) throw new Rechazo(409, "Drive no está conectado todavía.");
  const drive = new Drive(
    fetch,
    await tokenDeAcceso(fetch, { refresh_token: c.refresh_token, client_id: CLIENT_ID, client_secret: secreto() }),
  );
  // A nombre de quién: la persona que viajó, aunque rinda la jefatura por ella
  // (cada persona de una misma entrega tiene así su carpeta y su hoja).
  const responsable = r.beneficiario || r.responsable?.nombre || r.responsable?.correo || "";

  // 1. La carpeta de la rendición (una vez), compartida con quien rinde.
  let carpeta: string = r.drive_carpeta_id;
  if (!carpeta) {
    carpeta = c.carpeta_id;
    for (const nombre of rutaDeCarpeta(r as Rendicion, r.caja, responsable)) {
      carpeta = await drive.carpeta(nombre, carpeta, c.unidad_id);
    }
    await db.from("rendiciones").update({ drive_carpeta_id: carpeta }).eq("id", r.id);
    if (r.responsable?.correo) {
      await drive.compartir(carpeta, r.responsable.correo).catch((e) => console.error("compartir", e));
    }
  }

  const [{ data: filas }, { data: archivos }, catalogos] = await Promise.all([
    db.from("comprobantes").select("*").eq("rendicion_id", r.id),
    db.from("archivos").select("id, ruta, tipo_mime, tamano, drive_id, drive_md5").eq("rendicion_id", r.id),
    leerCatalogos(),
  ]);
  const comprobantes = (filas ?? []) as Comprobante[];

  // 2. Las imágenes que todavía no están en Drive. Se anota la huella MD5 que
  //    devuelve Drive solo si coincide con la de los bytes enviados.
  const imagenes = await drive.carpeta("Comprobantes", carpeta, c.unidad_id);
  const enlaces = new Map<string, string>();
  for (const a of archivos ?? []) {
    if (a.drive_id) {
      enlaces.set(a.id, `https://drive.google.com/file/d/${a.drive_id}/view`);
      continue;
    }
    if (!a.ruta) continue;
    const { data: blob } = await db.storage.from("comprobantes").download(a.ruta);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const md5 = encodeHex(await cripto.subtle.digest("MD5", bytes));
    const primero = comprobantes.filter((x) => x.archivo_id === a.id).sort((x, y) => x.pagina - y.pagina)[0];
    const ext = a.tipo_mime === "application/pdf"
      ? "pdf"
      : a.tipo_mime.split("/")[1] === "jpeg"
      ? "jpg"
      : a.tipo_mime.split("/")[1];
    const subido = await drive.subir(
      nombreDeImagen(primero, a.id, ext),
      imagenes,
      new Blob([bytes], { type: a.tipo_mime }),
      a.tipo_mime,
    );
    if (subido.md5Checksum !== md5) {
      // Una copia distinta del original no se usa ni se deja suelta en la carpeta.
      await drive.papelera(subido.id).catch((e) => console.error("papelera", e));
      throw new Error(`La copia en Drive de ${a.id} no coincide con el original.`);
    }
    await db.from("archivos").update({ drive_id: subido.id, drive_md5: md5 }).eq("id", a.id);
    enlaces.set(a.id, subido.webViewLink);
  }

  // 3. La hoja y el PDF de la versión enviada, una sola vez por versión.
  let hoja: string | null = null;
  let pdf: string | null = null;
  if (r.version > 0 && (await tomarVersion(r, comprobantes))) {
    const h = armarHoja({
      rendicion: r as Rendicion,
      caja: r.caja,
      administrador: responsable,
      comprobantes,
      catalogos,
      enlaces,
    });
    const nombre = `${titulo(r as Rendicion, r.caja)} · v${r.version}`;
    const bytes = await xlsx(h, {
      titulo: titulo(r as Rendicion, r.caja),
      responsable,
      estado: r.estado,
      version: r.version,
      recibido: Number(r.monto),
      tipo: r.tipo,
    });
    const subida = await drive.subir(nombre, carpeta, new Blob([bytes as Uint8Array<ArrayBuffer>]), "", true);
    hoja = subida.id;
    const archivoPdf = await drive.subir(`${nombre}.pdf`, carpeta, await drive.pdf(subida.id), "application/pdf");
    pdf = archivoPdf.id;
    await db.from("versiones").update({ hoja_id: hoja, pdf_drive_id: pdf, generado_en: new Date().toISOString() })
      .eq("rendicion_id", r.id).eq("numero", r.version);
  }

  // 4. Aprobada: cada imagen ya copiada se verifica en Drive y recién ahí se
  //    borra de Supabase.
  let archivadas = 0;
  if (CERRADAS.includes(r.estado)) {
    const { data: copiadas } = await db.from("archivos").select("id, ruta, tamano, drive_id, drive_md5").eq(
      "rendicion_id",
      r.id,
    )
      .not("drive_id", "is", null).not("ruta", "is", null);
    for (const a of copiadas ?? []) {
      const enDrive = await drive.datos(a.drive_id);
      if (enDrive.trashed || enDrive.md5Checksum !== a.drive_md5 || Number(enDrive.size) !== a.tamano) continue;
      const { error } = await db.storage.from("comprobantes").remove([a.ruta]);
      if (error) continue;
      await db.from("archivos").update({ ruta: null }).eq("id", a.id);
      archivadas++;
    }
  }
  return { ok: true, carpeta, hoja, pdf, archivadas };
}

/**
 * Reserva la versión para generarla. Devuelve falso si ya existe (o la está
 * generando otro pedido): dos clics no producen dos hojas.
 */
async function tomarVersion(
  r: { id: string; version: number; monto: unknown; no_sustentan: string[] | null },
  comprobantes: Comprobante[],
): Promise<boolean> {
  const { data: existe } = await db.from("versiones").select("id, hoja_id, generado_en").eq("rendicion_id", r.id).eq(
    "numero",
    r.version,
  ).maybeSingle();
  if (existe?.hoja_id) return false;
  if (existe) {
    // Quedó a medio camino: se retoma solo si pasó el plazo.
    const vencido = new Date(Date.now() - PLAZO_MS).toISOString();
    const { data } = await db.from("versiones").update({ generado_en: new Date().toISOString() }).eq("id", existe.id)
      .lt("generado_en", vencido).select("id");
    return !!data?.length;
  }
  const vigentes = comprobantes.filter((c) => !c.descartado && c.moneda !== "USD");
  const fuera = new Set(r.no_sustentan ?? []);
  const suma = (l: Comprobante[]) => Math.round(l.reduce((s, c) => s + Number(c.total ?? 0), 0) * 100) / 100;
  const { error } = await db.from("versiones").insert({
    rendicion_id: r.id,
    numero: r.version,
    total: suma(vigentes),
    sustentado: suma(vigentes.filter((c) => c.tipo_comprobante_id && !fuera.has(c.tipo_comprobante_id))),
    datos: { rendicion: r, comprobantes: comprobantes.filter((c) => !c.descartado) },
  });
  return !error; // un choque de la clave única es otro pedido que llegó primero
}

async function leerCatalogos(): Promise<Catalogos> {
  const [e, a, p, c, t] = await Promise.all([
    db.from("empresas").select("id, nombre"),
    db.from("areas").select("id, nombre"),
    db.from("proyectos").select("id, nombre"),
    db.from("conceptos").select("id, nombre"),
    db.from("tipos_comprobante").select("id, nombre, sustenta"),
  ]);
  return {
    empresas: e.data ?? [],
    areas: a.data ?? [],
    proyectos: p.data ?? [],
    conceptos: c.data ?? [],
    tipos: t.data ?? [],
  };
}

// ===========================================================================
// Memos: PDF membretado y legajo en Drive
// ===========================================================================

/** La app publicada, para los enlaces de los correos. */
const APP = Deno.env.get("APP_URL") || "https://inroprin-apps.github.io/InroMemos/web";
const LOGO = `${APP}/membrete-inroprin.png`;

async function googleConectado() {
  const c = await conexion();
  if (!c) throw new Rechazo(409, "Drive no está conectado todavía.");
  const token = await tokenDeAcceso(fetch, {
    refresh_token: c.refresh_token,
    client_id: CLIENT_ID,
    client_secret: secreto(),
  });
  return { c, token, drive: new Drive(fetch, token) };
}

/**
 * El PDF de un memo aprobado, en su carpeta (el legajo), con los sustentos
 * copiados al lado. Una vez por versión aprobada: si se corrige y se vuelve a
 * aprobar, sale otro PDF y el anterior se queda en el legajo.
 */
async function publicarMemo(memoId: string, uid: string | null, esAdmin: boolean) {
  const { data: m } = await db.from("memos")
    .select(
      "*, unidad:unidades(codigo, nombre, carpeta_drive, jefe_correo, suplente_correo), empresa:empresas(nombre, codigo)",
    )
    .eq("id", memoId).maybeSingle();
  if (!m) throw new Rechazo(404, "No existe ese memo.");
  if (uid) {
    const { data: p } = await db.from("personas").select("correo").eq("id", uid).maybeSingle();
    const participa = m.emisor_id === uid || [m.unidad?.jefe_correo, m.unidad?.suplente_correo].includes(p?.correo);
    if (!participa && !esAdmin) throw new Rechazo(403, "No tienes permiso sobre ese memo.");
  }
  if (!["aprobado", "enviado", "recibido"].includes(m.estado)) {
    return { publicado: false, motivo: "Se publica al aprobarse." };
  }
  if (m.pdf_drive_id && m.pdf_version === m.version) return { publicado: false, pdf: m.pdf_drive_id };

  const { c, token, drive } = await googleConectado();
  let carpeta: string = m.drive_carpeta_id;
  if (!carpeta) {
    // Si el área tiene su carpeta en Drive, el memo va ahí (por año); si no,
    // bajo la carpeta madre: Memos › Empresa › Área › Año.
    const anio = String(m.anio);
    let padre = m.unidad?.carpeta_drive || c.carpeta_id;
    const ruta = m.unidad?.carpeta_drive ? [anio] : rutaMemo(m.empresa?.nombre ?? "", m.unidad?.nombre ?? "", m.anio);
    for (const nombre of ruta) padre = await drive.carpeta(nombre, padre, c.unidad_id);
    carpeta = await drive.carpeta(nombreCarpeta(m.numero_visible, m.asunto), padre, c.unidad_id);
    await db.from("memos").update({ drive_carpeta_id: carpeta }).eq("id", m.id);
  }

  const [{ data: lineas }, { data: aprobador }] = await Promise.all([
    db.from("lineas_pago").select("*").eq("memo_id", m.id).order("orden"),
    m.aprobado_por
      ? db.from("personas").select("nombre, correo").eq("id", m.aprobado_por).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const html = htmlMemo(m, lineas ?? [], {
    empresa: m.empresa?.nombre ?? "",
    unidad: m.unidad?.nombre ?? "",
    aprobador: aprobador ? aprobador.nombre || aprobador.correo : null,
    logo: m.empresa?.codigo === "INR" ? LOGO : null,
  });
  const nombre = `MEMORÁNDUM ${m.numero_visible}${m.version > 1 ? ` v${m.version}` : ""} - APROBADO`;
  const doc = await docDesdeHtml(fetch, token, nombre, carpeta, html);
  const pdf = await drive.subir(`${nombre}.pdf`, carpeta, await drive.pdf(doc), "application/pdf");
  await db.from("memos").update({ pdf_drive_id: pdf.id, pdf_version: m.version }).eq("id", m.id);

  // Los sustentos se copian (no se mueven): Supabase sigue teniendo el suyo.
  const { data: sustentos } = await db.from("memo_sustentos").select("id, nombre, ruta, tipo_mime, drive_id")
    .eq("memo_id", m.id).eq("descartado", false).is("drive_id", null);
  for (const s of sustentos ?? []) {
    const { data: blob } = await db.storage.from("sustentos").download(s.ruta);
    if (!blob) continue;
    const subido = await drive.subir(s.nombre, carpeta, blob, s.tipo_mime);
    await db.from("memo_sustentos").update({ drive_id: subido.id }).eq("id", s.id);
  }

  // El PDF lo pueden abrir los participantes (salvo lo confidencial: ese,
  // solo por la plataforma).
  if (m.confidencialidad !== "confidencial") {
    const { data: emisor } = await db.from("personas").select("correo").eq("id", m.emisor_id).maybeSingle();
    const lectores = new Set(
      [emisor?.correo, m.destinatario_correo, ...(m.copias ?? []), m.unidad?.jefe_correo, m.unidad?.suplente_correo]
        .filter((x): x is string => !!x && x.endsWith("@inroprin.com")),
    );
    for (const correo of lectores) await drive.compartir(pdf.id, correo).catch((e) => console.error("compartir", e));
  }
  return { publicado: true, pdf: pdf.id, carpeta };
}

// ===========================================================================
// El reloj: correos pendientes y PDFs que faltan
// ===========================================================================

async function pendientes() {
  const resultado = { correos: 0, errores: 0, pdfs: 0 };
  const { data: avisos } = await db.from("avisos").select("*").in("estado", ["pendiente", "error"]).lt("intentos", 5)
    .order("creado_en").limit(25);
  if (avisos?.length) {
    const { c, token } = await googleConectado();
    const modo = Deno.env.get("CORREO_MODO") === "real" ? "real" : "prueba";
    for (const a of avisos) {
      const { data: m } = await db.from("memos").select("*").eq("id", a.memo_id).maybeSingle();
      if (!m) continue;
      const emisor = (await db.from("personas").select("correo").eq("id", m.emisor_id).maybeSingle()).data?.correo;
      try {
        const correo = armarCorreo(a, m, { app: APP, modo, cuentaPrueba: c.cuenta });
        await enviarCorreo(fetch, token, mensajeCrudo(correo, c.cuenta, emisor ?? undefined));
        await db.from("avisos").update({
          estado: "enviado",
          enviado_en: new Date().toISOString(),
          intentos: a.intentos + 1,
        })
          .eq("id", a.id);
        // El memo aprobado ya salió hacia su destinatario: queda «Enviado».
        if (a.tipo === "aprobado" && m.estado === "aprobado") {
          await db.from("memos").update({ estado: "enviado", enviado_en: new Date().toISOString() }).eq("id", m.id);
        }
        resultado.correos++;
      } catch (e) {
        resultado.errores++;
        await db.from("avisos").update({ estado: "error", error: (e as Error).message, intentos: a.intentos + 1 })
          .eq("id", a.id);
      }
    }
  }
  // Los memos aprobados cuyo PDF falta o es de otra versión.
  const { data: sinPdf } = await db.from("memos").select("id, version, pdf_version")
    .in("estado", ["aprobado", "enviado", "recibido"]).order("aprobado_en", { ascending: false }).limit(50);
  for (const m of (sinPdf ?? []).filter((x) => x.pdf_version !== x.version).slice(0, 5)) {
    try {
      if ((await publicarMemo(m.id, null, true)).publicado) resultado.pdfs++;
    } catch (e) {
      console.error("pdf", m.id, e);
    }
  }
  return resultado;
}

// ===========================================================================
// Cuentas bancarias: copia de las bases sin números completos, y verificación
// ===========================================================================

/**
 * La clave de las huellas de cuentas la genera la base (integraciones
 * «cuentas», que solo lee el sistema): nunca pasa por una persona.
 */
async function claveCuentas(): Promise<string> {
  const { data } = await db.from("integraciones").select("datos").eq("clave", "cuentas").maybeSingle();
  const k = (data?.datos as { clave?: string } | null)?.clave;
  if (!k || k.length < 32) throw new Rechazo(409, "Falta la clave de cuentas en integraciones (migración …_reloj).");
  return k;
}

/** El reloj de la base entra con un token cuya huella está en integraciones «reloj». */
async function esReloj(token: string): Promise<boolean> {
  const { data } = await db.from("integraciones").select("datos").eq("clave", "reloj").maybeSingle();
  const guardada = (data?.datos as { huella?: string } | null)?.huella;
  if (!guardada) return false;
  const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return h === guardada;
}

async function sincronizarCuentas() {
  const clave = await claveCuentas();
  const { data: bases } = await db.from("bases_cuentas").select("*").eq("activo", true);
  if (!bases?.length) throw new Rechazo(409, "No hay bases de cuentas configuradas.");
  const { token } = await googleConectado();
  const resumen: Record<string, number | string> = {};
  for (const b of bases) {
    const { data: corrida } = await db.from("corridas").insert({ job: `cuentas-${b.base.toLowerCase()}` }).select("id")
      .single();
    try {
      const cuentas = leerBase(await valoresDeHoja(fetch, token, b.hoja_id, b.pestana), b.base as Base);
      const filas = [];
      for (const x of cuentas) {
        filas.push({
          base: b.base,
          identificador: x.identificador,
          titular: x.titular,
          banco: x.banco,
          moneda: x.moneda,
          tipo: x.tipo,
          cuenta: mascara(x.cuenta),
          cci: x.cci ? mascara(x.cci) : "",
          huella_cuenta: await huella(clave, x.cuenta),
          huella_cci: x.cci ? await huella(clave, x.cci) : null,
          estado: "verificada",
          actualizado_en: new Date().toISOString(),
        });
      }
      const unicas = [
        ...new Map(filas.map((f) => [`${f.identificador}|${f.huella_cuenta}|${f.huella_cci}`, f])).values(),
      ];
      for (let i = 0; i < unicas.length; i += 500) {
        const { error } = await db.from("cuentas_bancarias").upsert(unicas.slice(i, i + 500), { onConflict: "llave" });
        if (error) throw new Error(error.message);
      }
      resumen[b.base] = unicas.length;
      await db.from("corridas").update({
        terminada_en: new Date().toISOString(),
        resultado: "OK",
        filas: unicas.length,
      })
        .eq("id", corrida?.id);
    } catch (e) {
      resumen[b.base] = (e as Error).message;
      await db.from("corridas").update({
        terminada_en: new Date().toISOString(),
        resultado: "ERROR",
        error: (e as Error).message,
      }).eq("id", corrida?.id);
    }
  }
  return resumen;
}

/**
 * La cuenta que escribe el emisor en una línea: llega completa solo hasta acá;
 * se guarda su huella y sus últimos 4 dígitos, y se compara con lo registrado.
 */
async function verificarCuenta(
  uid: string,
  cuerpo: { linea_id?: string; cuenta?: string; cci?: string; banco?: string },
) {
  const clave = await claveCuentas();
  const { data: l } = await db.from("lineas_pago").select("*, memo:memos(id, emisor_id, estado)").eq(
    "id",
    String(cuerpo.linea_id),
  )
    .maybeSingle();
  if (!l) throw new Rechazo(404, "No existe esa línea.");
  if (l.memo?.emisor_id !== uid || !["borrador", "observado"].includes(l.memo?.estado)) {
    throw new Rechazo(403, "Solo quien emite cambia la cuenta, mientras el memo se edita.");
  }
  const cuenta = String(cuerpo.cuenta ?? "").trim();
  const cci = soloDigitos(String(cuerpo.cci ?? ""));
  if (cci && cci.length !== 20) throw new Rechazo(400, "El CCI tiene 20 dígitos.");
  const hCuenta = cuenta ? await huella(clave, cuenta) : l.huella_cuenta;
  const hCci = cci ? await huella(clave, cci) : l.huella_cci;
  const id = identificador(l.beneficiario_doc);
  const { data: registradas } = await db.from("cuentas_bancarias").select("huella_cuenta, huella_cci, estado")
    .eq("identificador", id);
  let estado: string = comparar(registradas ?? [], hCuenta, hCci);

  // Nueva o distinta: queda pendiente de verificación para la próxima vez.
  if (estado === "no_registrada" || estado === "distinta") {
    const { data: p } = await db.from("personas").select("correo").eq("id", uid).maybeSingle();
    await db.from("cuentas_bancarias").upsert({
      base: "PLATAFORMA",
      identificador: id,
      titular: l.beneficiario,
      banco: cuerpo.banco || l.banco || null,
      tipo: "PRINCIPAL",
      cuenta: cuenta ? mascara(cuenta) : (l.cuenta || ""),
      cci: cci ? mascara(cci) : (l.cci || ""),
      huella_cuenta: hCuenta,
      huella_cci: hCci,
      estado: "pendiente",
      motivo: estado === "distinta" ? "discrepancia" : "alta",
      registrada_por: p?.correo ?? null,
      memo_id: l.memo_id,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "llave", ignoreDuplicates: true });
    estado = estado === "distinta" ? "distinta" : "pendiente";
  }
  const cambios = {
    banco: cuerpo.banco || l.banco,
    cuenta: cuenta ? mascara(cuenta) : l.cuenta,
    cci: cci ? mascara(cci) : l.cci,
    huella_cuenta: hCuenta,
    huella_cci: hCci,
    estado_cuenta: estado,
  };
  const { error } = await db.from("lineas_pago").update(cambios).eq("id", l.id);
  if (error) throw new Error(error.message);
  return cambios;
}
