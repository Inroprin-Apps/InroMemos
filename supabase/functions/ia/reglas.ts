// La IA de los memos, en lo que se puede probar sin red: el prompt de
// redacción (con las reglas de Finanzas), la plantilla de respaldo, y cómo se
// cruza lo que la IA leyó de un sustento con las líneas del memo.

export type Contexto = {
  idea: string;
  tipo: string;
  familia: string;
  area: string;
  empresa: string;
  destinatario: string;
  llevaPago: boolean;
  reservado: boolean;
  /** Entrega de viáticos ANTES del viaje: se pide el dinero, todavía no hay gastos. */
  entrega?: boolean;
  lineas: {
    beneficiario: string;
    concepto: string;
    monto: number;
    moneda: string;
    comprobante: string;
    /** Solo en la entrega: «03/11 al 08/11/2026». */
    periodo?: string;
  }[];
  ejemplos: { asunto: string; cuerpo: string }[];
};

export type Redaccion = { asunto: string; cuerpo: string; fuente: "IA" | "PLANTILLA" };

const CIERRE = "Su despacho servirá para disponer el pago correspondiente.";

const dinero = (n: number, m: string) =>
  `${m === "USD" ? "US$" : m === "EUR" ? "€" : "S/"} ${
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }`;

/** Los hechos que pone el servidor (de las líneas ya validadas), no la IA. */
export function hechos(c: Contexto): string {
  if (!c.llevaPago || !c.lineas.length) return "Sin pago.";
  const total = c.lineas.reduce((s, l) => s + l.monto, 0);
  const moneda = c.lineas[0].moneda;
  if (c.reservado) {
    return `Pago reservado: ${c.lineas.length} pagos, total ${dinero(total, moneda)}. NO nombres personas.`;
  }
  return [
    `Total: ${dinero(total, moneda)} en ${c.lineas.length} pago(s).`,
    ...c.lineas.slice(0, 15).map((l) =>
      `- ${l.beneficiario || "(sin beneficiario)"}${l.comprobante ? `, ${l.comprobante}` : ""}${
        l.periodo ? `, viaje del ${l.periodo}` : ""
      }${l.concepto ? `, ${l.concepto}` : ""}: ${dinero(l.monto, l.moneda)}`
    ),
  ].join("\n");
}

export function promptRedaccion(c: Contexto): string {
  return `Eres quien redacta los memorandos internos del Grupo INROPRIN (Perú). Redacta el ASUNTO y el CUERPO de un memorándum.

Reglas estrictas:
- Español formal y claro, de oficina peruana. Trato de «usted».
- NO inventes nombres, montos, fechas, RUC, números de comprobante ni cuentas: usa solo los HECHOS de abajo.
- Cuerpo de 1 a 3 párrafos cortos. Sin encabezado (A, DE, FECHA) ni firma: eso lo pone el sistema.
- Empieza con «Me dirijo a usted a fin de…» o similar.
${c.llevaPago ? `- Lleva pago: termina el cuerpo con «${CIERRE}»` : "- No lleva pago: no menciones pagos."}
${c.reservado ? "- Es RESERVADO: no nombres personas, solo totales." : ""}
${
    c.entrega
      ? "- Es una ENTREGA DE VIÁTICOS A RENDIR, antes del viaje: redacta como solicitud de asignación («solicito la asignación de viáticos…», qué cubrirán y el periodo), nunca como reembolso de gastos ya hechos. Termina pidiendo «proceder con el depósito de los montos indicados»."
      : ""
  }
- Asunto de hasta 140 caracteres, concreto (qué, de qué y para qué proyecto si lo hay).
- Devuelve solo JSON: {"asunto": "...", "cuerpo": "..."}.

Empresa: ${c.empresa}. Área que emite: ${c.area}. Tipo de memo: ${c.tipo} (${c.familia}).
Destinatario: ${c.destinatario || "(sin definir)"}.
Lo que la persona quiere decir: «${c.idea}».

HECHOS:
${hechos(c)}
${
    c.ejemplos.length
      ? `\nMemos anteriores del mismo tipo (estilo, no datos):\n${
        c.ejemplos.map((e) => `ASUNTO: ${e.asunto}\nCUERPO: ${e.cuerpo}`).join("\n---\n")
      }`
      : ""
  }`;
}

export const ESQUEMA_REDACCION = {
  type: "object",
  properties: { asunto: { type: "string" }, cuerpo: { type: "string" } },
  required: ["asunto", "cuerpo"],
};

/** Si la IA falla, el emisor nunca se queda sin texto. */
export function plantilla(c: Contexto): Redaccion {
  const idea = c.idea.trim().replace(/\.$/, "");
  const asunto = (idea.charAt(0).toUpperCase() + idea.slice(1)).slice(0, 140) || c.tipo;
  if (c.entrega) {
    return {
      asunto,
      cuerpo: `Me dirijo a usted a fin de solicitar la asignación de viáticos para ${
        idea.charAt(0).toLowerCase() + idea.slice(1)
      }, según el detalle de personas, fechas y montos que se indica. Los gastos se rendirán con sus comprobantes al término del viaje.\n\nFavor de proceder con el depósito de los montos indicados.`,
      fuente: "PLANTILLA",
    };
  }
  const que = c.llevaPago
    ? `solicitar el pago de ${idea.charAt(0).toLowerCase() + idea.slice(1)}`
    : `comunicarle ${idea}`;
  return {
    asunto,
    cuerpo: `Me dirijo a usted a fin de ${que}, según el detalle y los documentos adjuntos.${
      c.llevaPago ? `\n\n${CIERRE}` : ""
    }`,
    fuente: "PLANTILLA",
  };
}

/** Lo que vuelve de la IA, limpio; si no sirve, la plantilla. */
export function normalizarRedaccion(crudo: unknown, c: Contexto): Redaccion {
  const r = crudo as { asunto?: unknown; cuerpo?: unknown };
  const asunto = typeof r?.asunto === "string" ? r.asunto.trim().slice(0, 200) : "";
  let cuerpo = typeof r?.cuerpo === "string" ? r.cuerpo.trim().slice(0, 4000) : "";
  if (!asunto || !cuerpo) return plantilla(c);
  if (c.llevaPago && !cuerpo.includes(CIERRE)) cuerpo = `${cuerpo}\n\n${CIERRE}`;
  return { asunto, cuerpo, fuente: "IA" };
}

// ---------------------------------------------------------------------------
// Lectura de un sustento
// ---------------------------------------------------------------------------

export const PROMPT_SUSTENTO =
  `Lee este documento de sustento de un pago (factura, boleta, recibo por honorarios, contrato, acta, carta fianza…).
Devuelve solo JSON con lo que se lee CLARAMENTE; lo que no se lea, null. No inventes.
{"tipo": "factura|boleta|recibo_honorarios|contrato|acta|carta_fianza|guia|otro", "ruc_emisor": "11 dígitos o null",
 "razon_social": "...", "serie": "F001 o null", "numero": "solo dígitos o null", "fecha": "AAAA-MM-DD o null",
 "moneda": "PEN|USD|EUR|null", "total": número o null}`;

export const ESQUEMA_SUSTENTO = {
  type: "object",
  properties: {
    tipo: { type: "string" },
    ruc_emisor: { type: "string", nullable: true },
    razon_social: { type: "string", nullable: true },
    serie: { type: "string", nullable: true },
    numero: { type: "string", nullable: true },
    fecha: { type: "string", nullable: true },
    moneda: { type: "string", nullable: true },
    total: { type: "number", nullable: true },
  },
  required: ["tipo"],
};

export type Leido = {
  tipo: string;
  ruc_emisor: string | null;
  razon_social: string | null;
  serie: string | null;
  numero: string | null;
  fecha: string | null;
  moneda: string | null;
  total: number | null;
};

export type LineaCruce = { orden: number; beneficiario_doc: string; serie: string; numero: string; monto: number };

const clave = (serie: string | null, numero: string | null) =>
  `${(serie ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+(?=.)/, "")}-${
    (numero ?? "").replace(/\D/g, "").replace(/^0+(?=.)/, "")
  }`;

/** Cómo cruza lo leído con las líneas del memo: avisos en palabras. */
export function cruzar(l: Leido, lineas: LineaCruce[]): string[] {
  if (!["factura", "boleta", "recibo_honorarios"].includes(l.tipo)) return [];
  if (!l.ruc_emisor && !l.numero) return ["No se pudo leer el RUC ni el número del comprobante."];
  const misma = lineas.find((x) =>
    x.beneficiario_doc === l.ruc_emisor && clave(x.serie, x.numero) === clave(l.serie, l.numero)
  );
  if (!misma) {
    const delRuc = lineas.find((x) => x.beneficiario_doc === l.ruc_emisor);
    return delRuc
      ? [
        `El comprobante leído (${l.serie ?? ""}-${
          l.numero ?? ""
        }) no es el de la línea ${delRuc.orden} (${delRuc.serie}-${delRuc.numero}).`,
      ]
      : [`El RUC del comprobante (${l.ruc_emisor ?? "sin leer"}) no está en ninguna línea del memo.`];
  }
  if (l.total != null && Math.abs(l.total - misma.monto) > 0.05) {
    return [`El comprobante dice ${l.total.toFixed(2)} y la línea ${misma.orden} pide ${misma.monto.toFixed(2)}.`];
  }
  return [];
}
