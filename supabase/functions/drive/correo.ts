// Los avisos por correo de los memos: qué dice cada uno y cómo se arma el
// mensaje para Gmail. Puro, para probarlo.
//
// MODO PRUEBA (por omisión, hasta que el secreto CORREO_MODO diga «real»):
// todo va SOLO a la cuenta conectada, con una franja que dice a quiénes iba.

export type Aviso = {
  tipo: string;
  para: string[];
  copia: string[];
  fuera_de_meta: boolean;
};

export type MemoAviso = {
  id: string;
  numero_visible: string | null;
  asunto: string;
  emisor_nombre: string;
  destinatario_nombre: string;
  ultima_observacion: string;
  motivo_anulacion: string;
  total: number | string;
  moneda: string;
  requiere_pago: boolean;
};

export type Correo = { para: string[]; copia: string[]; asunto: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TEXTOS: Record<string, { titulo: (m: MemoAviso) => string; cuerpo: (m: MemoAviso) => string; boton: string }> = {
  por_aprobar: {
    titulo: (m) => `Por aprobar: memo ${m.numero_visible}`,
    cuerpo: (m) => `${m.emisor_nombre} emitió un memo que espera tu aprobación.`,
    boton: "Revisar y aprobar",
  },
  recordatorio_aprobar: {
    titulo: (m) => `Recordatorio: el memo ${m.numero_visible} espera tu aprobación`,
    cuerpo: () => "Este memo sigue esperando tu aprobación.",
    boton: "Revisar y aprobar",
  },
  aprobado: {
    titulo: (m) => `Memo ${m.numero_visible}: ${m.asunto}`,
    cuerpo: (m) => `${m.emisor_nombre} te envía este memo, ya aprobado. Confirma que lo recibiste con «Dar cargo».`,
    boton: "Ver el memo y dar cargo",
  },
  recordatorio_cargo: {
    titulo: (m) => `Recordatorio: falta tu cargo del memo ${m.numero_visible}`,
    cuerpo: () => "Recibiste este memo y todavía no confirmaste la recepción.",
    boton: "Dar cargo",
  },
  observado: {
    titulo: (m) => `Observado: memo ${m.numero_visible}`,
    cuerpo: (m) =>
      `Tu memo fue observado: «${m.ultima_observacion}». Corrígelo y vuelve a enviarlo: conserva su número.`,
    boton: "Corregir el memo",
  },
  recibido: {
    titulo: (m) => `Cargo recibido: memo ${m.numero_visible}`,
    cuerpo: (m) => `${m.destinatario_nombre || "El destinatario"} dio el cargo de tu memo.`,
    boton: "Ver el memo",
  },
  anulado: {
    titulo: (m) => `Anulado: memo ${m.numero_visible}`,
    cuerpo: (m) => `El memo fue anulado: «${m.motivo_anulacion}». Su número no se vuelve a usar.`,
    boton: "Ver el memo",
  },
};

export function armarCorreo(
  a: Aviso,
  m: MemoAviso,
  o: { app: string; modo: "prueba" | "real"; cuentaPrueba: string },
): Correo {
  const t = TEXTOS[a.tipo] ?? TEXTOS.aprobado;
  const enlace = `${o.app.replace(/\/+$/, "")}/memos/memo/?id=${m.id}`;
  const prueba = o.modo !== "real";
  const meta = a.fuera_de_meta ? "[FUERA DE META] " : "";
  const asunto = `${prueba ? "[PRUEBA] " : ""}${meta}${t.titulo(m)}`;
  const franja = prueba
    ? `<p style="background:#fff6cc;color:#8a6300;padding:8px 12px;border-radius:8px">Modo prueba: este correo iba para ${
      esc(a.para.join(", "))
    }${a.copia.length ? ` (con copia a ${esc(a.copia.join(", "))})` : ""}.</p>`
    : "";
  const monto = m.requiere_pago
    ? `<p style="color:#5c5c58">Total: <b>${
      (m.moneda === "USD" ? "US$ " : m.moneda === "EUR" ? "€ " : "S/ ") +
      (Number(m.total) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }</b></p>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1d1d1b;max-width:560px">
${franja}
<p style="font-size:16px"><b>${esc(t.titulo(m))}</b></p>
<p>${esc(t.cuerpo(m))}</p>
<p style="color:#5c5c58">Asunto: ${esc(m.asunto)}</p>
${monto}
<p><a href="${
    esc(enlace)
  }" style="display:inline-block;background:#006db1;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:9px;font-weight:bold">${
    esc(t.boton)
  }</a></p>
<p style="color:#8a8a86;font-size:12px">InroScan · Plataforma de Memorandums de INROPRIN</p>
</div>`;
  return {
    para: prueba ? [o.cuentaPrueba] : a.para,
    copia: prueba ? [] : a.copia.filter((c) => !a.para.includes(c)),
    asunto,
    html,
  };
}

/** Un encabezado con tildes, como lo pide el correo (RFC 2047). */
const encabezado = (s: string) =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;

/** El mensaje completo para Gmail (users.messages.send, campo raw). */
export function mensajeCrudo(c: Correo, de: string, responderA?: string): string {
  const html = btoa(String.fromCharCode(...new TextEncoder().encode(c.html))).replace(/.{1,76}/g, "$&\r\n");
  return [
    `From: ${encabezado("InroScan")} <${de}>`,
    `To: ${c.para.join(", ")}`,
    ...(c.copia.length ? [`Cc: ${c.copia.join(", ")}`] : []),
    ...(responderA ? [`Reply-To: ${responderA}`] : []),
    `Subject: ${encabezado(c.asunto)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    html,
  ].join("\r\n");
}
