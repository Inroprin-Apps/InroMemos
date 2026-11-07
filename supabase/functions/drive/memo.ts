// El memo como papel: el HTML que Drive convierte en documento y luego en PDF,
// y los nombres de su carpeta. Puro, para probarlo.
//
// Reglas del diseño de Finanzas: encabezado A / DE / ASUNTO / FECHA; cuentas
// siempre enmascaradas; un memo RESTRINGIDO o CONFIDENCIAL no lista personas,
// solo el total (el detalle va en un anexo restringido); el sello de
// aprobación con su código.

export type MemoPapel = {
  numero_visible: string;
  asunto: string;
  cuerpo: string;
  emisor_nombre: string;
  destinatario_nombre: string;
  destinatario_correo: string;
  copias: string[];
  confidencialidad: "normal" | "restringido" | "confidencial";
  requiere_pago: boolean;
  moneda: string;
  emitido_en: string | null;
  aprobado_en: string | null;
  codigo_sello: string | null;
  version: number;
};

export type LineaPapel = {
  beneficiario: string;
  beneficiario_doc: string;
  serie: string;
  numero: string;
  banco: string;
  cuenta: string;
  cci: string;
  monto: number | string;
  moneda: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function dinero(monto: number | string, moneda: string): string {
  const n = Number(monto) || 0;
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${moneda === "USD" ? "US$" : moneda === "EUR" ? "€" : "S/"} ${s}`;
}

/** «Lima, 6 de noviembre de 2026», en hora de Lima. */
export function fechaLarga(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return `Lima, ${
    d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" })
  }`;
}

/** «MEMO 029-2026 PAGO DE PRIMA…»: sin los caracteres que Drive no quiere, hasta 90. */
export function nombreCarpeta(numeroVisible: string, asunto: string): string {
  const corto = numeroVisible.replace(/^(\d+-\d{4}).*$/, "$1");
  return `MEMO ${corto} ${asunto}`.replace(/[\\/:*?"<>|#%{}~&]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90).trim();
}

/** Empresa › Área › Año: dónde va el memo dentro de la carpeta de memos. */
export function rutaMemo(empresa: string, area: string, anio: number): string[] {
  return ["Memos", empresa, area, String(anio)];
}

export function htmlMemo(
  m: MemoPapel,
  lineas: LineaPapel[],
  o: { empresa: string; unidad: string; aprobador: string | null; logo: string | null },
): string {
  const reservado = m.confidencialidad !== "normal";
  const total = lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);
  // Google Docs dibuja un borde negro en cada celda que no diga lo contrario:
  // cada lado se declara a mano.
  const sinBorde = "border-top:none;border-left:none;border-right:none";
  const celda = `${sinBorde};border-bottom:1px solid #e4e4e1;padding:4px 6px;font-size:9.5pt;vertical-align:top`;
  const cab =
    `${sinBorde};border-bottom:1px solid #d2d2ce;padding:4px 6px;font-size:8.5pt;color:#5c5c58;text-align:left`;
  const dato = "border:none;padding:3px 0;vertical-align:top";
  const linea = `${sinBorde};border-bottom:2px solid #006db1;padding:0 0 8px 0;vertical-align:bottom`;

  const tabla = !m.requiere_pago || lineas.length === 0
    ? ""
    : reservado
    ? `<p style="background:#f7f7f6;padding:6px 8px">Total: <b>${
      esc(dinero(total, m.moneda))
    }</b> en ${lineas.length} pago${
      lineas.length === 1 ? "" : "s"
    }. El detalle va en un anexo de acceso restringido.</p>`
    : `<table style="border-collapse:collapse;width:100%;margin-top:8px">
<tr><th style="${cab}">BENEFICIARIO</th><th style="${cab}">COMPROBANTE</th><th style="${cab}">BANCO · CUENTA</th><th style="${cab};text-align:right">MONTO</th></tr>
${
      lineas.map((l) =>
        `<tr><td style="${celda}">${esc(l.beneficiario)}<br><span style="color:#8a8a86;font-size:8.5pt">${
          esc(l.beneficiario_doc)
        }</span></td><td style="${celda}">${l.numero ? esc(`${l.serie}-${l.numero}`) : "—"}</td><td style="${celda}">${
          l.banco ? esc(`${l.banco} ${l.cuenta || l.cci}`) : "—"
        }</td><td style="${celda};text-align:right">${esc(dinero(l.monto, l.moneda))}</td></tr>`
      ).join("\n")
    }
<tr><td colspan="3" style="${celda};text-align:right"><b>Total</b></td><td style="${celda};text-align:right"><b>${
      esc(dinero(total, m.moneda))
    }</b></td></tr>
</table>`;

  const sello = m.codigo_sello
    ? `<table style="border-collapse:collapse;margin-top:18px;width:100%"><tr><td style="border:2px solid #00a298;padding:8px 14px;color:#007a72">
<b style="letter-spacing:1px">APROBADO</b><br>${esc(o.aprobador ?? "")}${o.aprobador ? " · " : ""}${
      esc(fechaLarga(m.aprobado_en).replace(/^Lima, /, ""))
    } · código <b>${esc(m.codigo_sello)}</b></td></tr></table>`
    : `<p style="margin-top:18px;color:#8a8a86">Pendiente de aprobación (versión ${m.version}).</p>`;

  const copias = m.copias.length
    ? `<tr><td style="${dato}"><b>CC:</b></td><td style="${dato}">${esc(m.copias.join(", "))}</td></tr>`
    : "";

  return `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:10.5pt;color:#1d1d1b">
<table style="width:100%;border-collapse:collapse;border:none"><tr>
<td style="${linea}">${
    o.logo ? `<img src="${esc(o.logo)}" width="180" height="40">` : `<b style="font-size:16pt">${esc(o.empresa)}</b>`
  }</td>
<td style="${linea};text-align:right;color:#8a8a86;font-size:8.5pt">${esc(o.empresa)}<br>${
    esc(o.unidad)
  }</td></tr></table>
<p style="font-size:13pt;margin-top:18pt;margin-bottom:8pt"><b>MEMORÁNDUM ${esc(m.numero_visible)}</b></p>
<table style="border-collapse:collapse;border:none">
<tr><td style="${dato};width:80pt"><b>A:</b></td><td style="${dato}">${
    esc(m.destinatario_nombre || m.destinatario_correo)
  }</td></tr>
<tr><td style="${dato}"><b>DE:</b></td><td style="${dato}">${esc(m.emisor_nombre)}</td></tr>
${copias}
<tr><td style="${dato}"><b>ASUNTO:</b></td><td style="${dato}">${esc(m.asunto)}</td></tr>
<tr><td style="${dato}"><b>FECHA:</b></td><td style="${dato}">${esc(fechaLarga(m.emitido_en))}</td></tr>
</table>
${
    m.cuerpo.split(/\n{2,}/).map((p) =>
      `<p style="margin-top:10pt;line-height:1.4">${esc(p).replace(/\n/g, "<br>")}</p>`
    ).join("\n")
  }
${tabla}
<p style="margin-top:14pt">Atentamente,</p>
${sello}
</body></html>`;
}
