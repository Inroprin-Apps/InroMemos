/**
 * Lo poco de Google que hace falta: el token, la carpeta madre, carpetas,
 * subir, convertir a hoja, exportar a PDF y compartir. Todo con
 * `supportsAllDrives`, porque la carpeta madre suele vivir en una unidad
 * compartida.
 *
 * `pedir` se inyecta para poder probar sin red.
 */

export type Pedir = typeof fetch;

const API = "https://www.googleapis.com/drive/v3";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";
const CARPETA = "application/vnd.google-apps.folder";
const HOJA = "application/vnd.google-apps.spreadsheet";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export class ErrorDeGoogle extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

async function comprobar(r: Response, que: string): Promise<Response> {
  if (r.ok) return r;
  const detalle = (await r.text()).slice(0, 300);
  if (r.status === 401 || /invalid_grant/.test(detalle)) {
    throw new ErrorDeGoogle(
      r.status,
      "La conexión con Drive venció o se revocó: vuelve a conectarla en Administración › Drive.",
    );
  }
  if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED/.test(detalle)) {
    throw new ErrorDeGoogle(r.status, "La API de Google Drive no está activada en el proyecto de Google Cloud.");
  }
  throw new ErrorDeGoogle(r.status, `Drive no pudo ${que} (${r.status}): ${detalle}`);
}

/** Canjea el código de la pantalla de Google por tokens (con el de larga duración). */
export async function canjearCodigo(
  pedir: Pedir,
  datos: { code: string; redirect_uri: string; client_id: string; client_secret: string },
): Promise<{ refresh_token?: string; access_token: string }> {
  const r = await pedir("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...datos, grant_type: "authorization_code" }),
  });
  return (await comprobar(r, "conectar la cuenta")).json();
}

export async function tokenDeAcceso(
  pedir: Pedir,
  datos: { refresh_token: string; client_id: string; client_secret: string },
): Promise<string> {
  const r = await pedir("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...datos, grant_type: "refresh_token" }),
  });
  return (await (await comprobar(r, "renovar el acceso")).json()).access_token;
}

export async function correoDe(pedir: Pedir, token: string): Promise<string> {
  const r = await pedir("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await (await comprobar(r, "leer la cuenta")).json()).email;
}

/** Comillas y barras escapadas para las consultas `q` de Drive. */
const literal = (t: string) => `'${t.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export class Drive {
  constructor(private pedir: Pedir, private token: string) {}

  private async llamar(url: string, que: string, init: RequestInit = {}): Promise<Response> {
    const r = await this.pedir(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
    });
    return comprobar(r, que);
  }

  /**
   * La carpeta madre (una carpeta cualquiera o la raíz de una unidad
   * compartida). `driveId` dice en qué unidad vive, si vive en una.
   */
  async carpetaMadre(id: string): Promise<{ id: string; name: string; driveId: string | null }> {
    const campos = "id,name,mimeType,driveId,trashed,capabilities(canAddChildren)";
    let c;
    try {
      c = await (await this.llamar(`${API}/files/${id}?supportsAllDrives=true&fields=${campos}`, "abrir la carpeta"))
        .json();
    } catch (e) {
      if (e instanceof ErrorDeGoogle && e.status === 404) {
        throw new ErrorDeGoogle(404, "La cuenta conectada no ve esa carpeta: revisa el enlace o compártesela.");
      }
      throw e;
    }
    if (c.mimeType !== CARPETA || c.trashed) throw new ErrorDeGoogle(400, "Ese enlace no es de una carpeta vigente.");
    if (!c.capabilities?.canAddChildren) {
      throw new ErrorDeGoogle(
        403,
        `La cuenta conectada no puede crear archivos en «${c.name}»: necesita poder editarla.`,
      );
    }
    return { id: c.id, name: c.name, driveId: c.driveId ?? null };
  }

  /** Busca una carpeta por nombre dentro de otra; si no está, la crea. */
  async carpeta(nombre: string, padre: string, unidad: string | null): Promise<string> {
    const q = encodeURIComponent(
      `name = ${literal(nombre)} and ${literal(padre)} in parents and mimeType = '${CARPETA}' and trashed = false`,
    );
    const donde = unidad ? `corpora=drive&driveId=${unidad}` : "corpora=allDrives";
    const r = await this.llamar(
      `${API}/files?q=${q}&${donde}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id)`,
      "buscar una carpeta",
    );
    const hallada = (await r.json()).files?.[0]?.id;
    if (hallada) return hallada;
    const c = await this.llamar(`${API}/files?supportsAllDrives=true&fields=id`, "crear una carpeta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }),
    });
    return (await c.json()).id;
  }

  /** Sube un archivo. `comoHoja` convierte un .xlsx en Google Sheets al subirlo. */
  async subir(
    nombre: string,
    padre: string,
    contenido: Blob,
    mime: string,
    comoHoja = false,
  ): Promise<{ id: string; md5Checksum?: string; size?: string; webViewLink: string }> {
    const metadatos = { name: nombre, parents: [padre], ...(comoHoja ? { mimeType: HOJA } : {}) };
    // Drive pide «multipart/related» (no el multipart de un formulario): los
    // metadatos y el contenido, cada uno con su tipo.
    const borde = `inroscan-${crypto.randomUUID()}`;
    const cuerpo = new Blob([
      `--${borde}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadatos)}\r\n`,
      `--${borde}\r\nContent-Type: ${comoHoja ? XLSX : mime}\r\n\r\n`,
      contenido,
      `\r\n--${borde}--`,
    ]);
    const r = await this.llamar(
      `${SUBIDA}?uploadType=multipart&supportsAllDrives=true&fields=id,md5Checksum,size,webViewLink`,
      `subir «${nombre}»`,
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${borde}` }, body: cuerpo },
    );
    return r.json();
  }

  /** Una hoja de Google exportada a PDF. */
  async pdf(id: string): Promise<Blob> {
    const r = await this.llamar(`${API}/files/${id}/export?mimeType=application/pdf`, "exportar el PDF");
    return r.blob();
  }

  async datos(id: string): Promise<{ md5Checksum?: string; size?: string; trashed?: boolean }> {
    const r = await this.llamar(
      `${API}/files/${id}?supportsAllDrives=true&fields=md5Checksum,size,trashed`,
      "verificar una copia",
    );
    return r.json();
  }

  /** A la papelera (se puede recuperar), no borrado definitivo. */
  async papelera(id: string): Promise<void> {
    await this.llamar(`${API}/files/${id}?supportsAllDrives=true`, "mandar a la papelera", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }

  /** Deja ver la carpeta a quien rinde, sin mandarle correo. */
  async compartir(id: string, correo: string): Promise<void> {
    await this.llamar(
      `${API}/files/${id}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
      "compartir la carpeta",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "user", emailAddress: correo }),
      },
    );
  }
}

const DOC = "application/vnd.google-apps.document";

/** Un documento de Google armado desde HTML (Drive lo convierte al subirlo). */
export async function docDesdeHtml(
  pedir: Pedir,
  token: string,
  nombre: string,
  padre: string,
  html: string,
): Promise<string> {
  const limite = `inroscan${crypto.randomUUID()}`;
  const cuerpo = [
    `--${limite}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: nombre, parents: [padre], mimeType: DOC }),
    `--${limite}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    `--${limite}--`,
  ].join("\r\n");
  const r = await pedir(`${SUBIDA}?uploadType=multipart&supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${limite}` },
    body: cuerpo,
  });
  if (!r.ok) {
    throw new ErrorDeGoogle(
      r.status,
      `No se pudo crear el documento del memo (${r.status}): ${(await r.text()).slice(0, 300)}`,
    );
  }
  return (await r.json()).id;
}

/** Envía un correo ya armado (RFC 2822) desde la cuenta conectada. */
export async function enviarCorreo(pedir: Pedir, token: string, crudo: string): Promise<string> {
  const raw = btoa(String.fromCharCode(...new TextEncoder().encode(crudo)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await pedir("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (r.status === 403) {
    throw new ErrorDeGoogle(
      403,
      "Google no deja enviar correos con esta conexión: reconecta Drive en Administración › Drive para dar el permiso de Gmail.",
    );
  }
  if (!r.ok) {
    throw new ErrorDeGoogle(r.status, `Gmail rechazó el correo (${r.status}): ${(await r.text()).slice(0, 300)}`);
  }
  return (await r.json()).id;
}

/** Las celdas de una pestaña de Google Sheets, como texto. */
export async function valoresDeHoja(pedir: Pedir, token: string, hoja: string, pestana: string): Promise<string[][]> {
  const rango = encodeURIComponent(`'${pestana.replace(/'/g, "''")}'`);
  const r = await pedir(
    `https://sheets.googleapis.com/v4/spreadsheets/${hoja}/values/${rango}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) {
    throw new ErrorDeGoogle(
      r.status,
      `No se pudo leer la hoja ${pestana} (${r.status}): ${(await r.text()).slice(0, 300)}`,
    );
  }
  return ((await r.json()).values ?? []) as string[][];
}
