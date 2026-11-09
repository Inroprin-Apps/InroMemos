// Las tres bases de cuentas bancarias (hojas de Google que no se tocan) leídas
// por encabezado, y la huella de una cuenta. Puro, para probarlo.
//
// La base de INROMEMOS NUNCA guarda un número de cuenta completo: guarda los
// últimos 4 dígitos para mostrar y una huella HMAC-SHA256 (con una clave que
// solo conoce la función) para comparar. Con la huella se sabe si dos números
// son el mismo, pero no se puede volver al número.

export type Base = "NACIONAL" | "IMPORTACIONES" | "RRHH";

export type Cuenta = {
  identificador: string;
  titular: string | null;
  banco: string | null;
  moneda: string | null;
  tipo: string;
  cuenta: string;
  cci: string;
};

export const soloDigitos = (s: string) => s.replace(/\D/g, "");
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Los últimos 4 caracteres de una cuenta, para mostrar: «••••4521». */
export function mascara(cuenta: string): string {
  const d = cuenta.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return d ? `••••${d.slice(-4)}` : "";
}

/** RUC, DNI o código sin ceros a la izquierda (Sheets puede volver número un DNI). */
export const identificador = (s: string) => s.trim().toUpperCase().replace(/^0+(?=.)/, "");

/** Huella de una cuenta: HMAC-SHA256 de sus dígitos (o letras, en un IBAN). */
export async function huella(clave: string, cuenta: string): Promise<string | null> {
  const v = cuenta.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (v.length < 6) return null;
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [
      "sign",
    ],
  );
  const firma = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(v));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cada cuenta de una fila: [tipo, columna de banco, de moneda, de cuenta, de CCI].
type Grupo = { tipo: string; banco: string[]; moneda: string[]; cuenta: string[]; cci: string[] };

const GRUPOS: Record<Base, { id: string[]; titular: string[]; grupos: Grupo[] }> = {
  NACIONAL: {
    id: ["RUC"],
    titular: ["RAZON SOCIAL", "PROVEEDOR", "NOMBRE"],
    grupos: [
      {
        tipo: "PRINCIPAL",
        banco: ["BANCO"],
        moneda: ["MONEDA"],
        cuenta: ["NUMERO DE CTA", "NUMERO DE CUENTA", "N° DE CTA"],
        cci: ["CCI"],
      },
      {
        tipo: "SECUNDARIA",
        banco: ["BANCO 2"],
        moneda: ["MONEDA 2"],
        cuenta: ["NUMERO DE CTA 2", "NUMERO DE CUENTA 2"],
        cci: ["CCI 2"],
      },
      { tipo: "DETRACCION", banco: [], moneda: [], cuenta: ["CTA DETRACCION", "CUENTA DETRACCION"], cci: [] },
    ],
  },
  IMPORTACIONES: {
    id: ["TAX ID", "RAZON SOCIAL - SUPPLIER"],
    titular: ["RAZON SOCIAL - SUPPLIER", "NOMBRE DE CUENTA"],
    grupos: [{ tipo: "EXTERIOR", banco: ["BANCO"], moneda: ["MONEDA"], cuenta: ["NUMERO DE CUENTA", "IBAN"], cci: [] }],
  },
  RRHH: {
    id: ["DNI"],
    titular: ["APELLIDOS Y NOMBRES", "NOMBRES Y APELLIDOS", "NOMBRE"],
    grupos: [
      {
        tipo: "PLANILLA",
        banco: ["BANCO - PLANILLA"],
        moneda: [],
        cuenta: ["CUENTA - PLANILLA"],
        cci: ["CCI PLANILLA", "CCI - PLANILLA"],
      },
      { tipo: "CTS", banco: ["BANCO - CTS"], moneda: [], cuenta: ["CUENTA - CTS"], cci: ["CCI - CTS", "CCI CTS"] },
    ],
  },
};

/** La fila de encabezados: la primera que tiene la columna del identificador. */
function filaEncabezado(valores: string[][], base: Base): number {
  const ids = GRUPOS[base].id.map(sinTildes);
  return valores.findIndex((f) => f.some((c) => ids.includes(sinTildes(c ?? ""))));
}

/** Las cuentas de una base, leídas por encabezado (nunca por posición). */
export function leerBase(valores: string[][], base: Base): Cuenta[] {
  const g = GRUPOS[base];
  const i = filaEncabezado(valores, base);
  if (i < 0) throw new Error(`No encuentro la columna ${g.id.join(" / ")} en la base ${base}.`);
  const cab = valores[i].map((c) => sinTildes(c ?? ""));
  // La primera columna que coincide (en RRHH el DNI aparece dos veces: vale la primera).
  const col = (nombres: string[]) => {
    for (const n of nombres.map(sinTildes)) {
      const k = cab.indexOf(n);
      if (k >= 0) return k;
    }
    return -1;
  };
  const cId = col(g.id);
  const cTit = col(g.titular);
  const out: Cuenta[] = [];
  for (const fila of valores.slice(i + 1)) {
    const v = (k: number) => (k >= 0 ? String(fila[k] ?? "").trim() : "");
    const id = identificador(v(cId));
    if (!id) continue;
    for (const gr of g.grupos) {
      const cuenta = v(col(gr.cuenta));
      const cci = soloDigitos(v(col(gr.cci)));
      if (cuenta.replace(/[^0-9A-Za-z]/g, "").length < 6 && cci.length < 6) continue;
      out.push({
        identificador: id,
        titular: v(cTit) || null,
        banco: v(col(gr.banco)) || null,
        moneda: v(col(gr.moneda)) || null,
        tipo: gr.tipo,
        cuenta,
        cci,
      });
    }
  }
  return out;
}

export type Resultado = "coincide" | "pendiente" | "distinta" | "no_registrada" | "datos_incompletos";

/**
 * Cómo queda una cuenta ingresada frente a lo registrado para ese
 * beneficiario: coincide con una verificada; coincide con una pendiente;
 * distinta (tiene otras, no esta); o no registrada (no tiene ninguna).
 */
export function comparar(
  registradas: { huella_cuenta: string | null; huella_cci: string | null; estado: string }[],
  hCuenta: string | null,
  hCci: string | null,
): Resultado {
  if (!hCuenta && !hCci) return "datos_incompletos";
  const igual = (r: { huella_cuenta: string | null; huella_cci: string | null }) =>
    (hCuenta !== null && r.huella_cuenta === hCuenta) || (hCci !== null && r.huella_cci === hCci);
  const vivas = registradas.filter((r) => r.estado !== "rechazada");
  if (vivas.some((r) => r.estado === "verificada" && igual(r))) return "coincide";
  if (vivas.some((r) => r.estado === "pendiente" && igual(r))) return "pendiente";
  return vivas.length ? "distinta" : "no_registrada";
}
