import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14";
import { type Contexto, cruzar, hechos, normalizarRedaccion, plantilla, promptRedaccion } from "./reglas.ts";

const c: Contexto = {
  idea: "pago primas CESCE talleres Medrano",
  tipo: "Renovación de fianza",
  familia: "Fianzas y garantías",
  area: "Finanzas",
  empresa: "INROPRIN",
  destinatario: "Marieu García",
  llevaPago: true,
  reservado: false,
  lineas: [{ beneficiario: "CESCE", concepto: "SEGUROS", monto: 3632.95, moneda: "PEN", comprobante: "F001-1234" }],
  ejemplos: [],
};

Deno.test("los hechos los pone el servidor; en un memo reservado, sin personas", () => {
  assertStringIncludes(hechos(c), "Total: S/ 3,632.95 en 1 pago(s).");
  assertStringIncludes(hechos(c), "- CESCE, F001-1234, SEGUROS: S/ 3,632.95");
  assertEquals(hechos({ ...c, reservado: true }).includes("CESCE"), false);
  assertStringIncludes(promptRedaccion(c), "NO inventes nombres");
  assertStringIncludes(promptRedaccion(c), "Su despacho servirá");
});

Deno.test("si la IA falla o responde a medias, queda la plantilla; con pago, siempre el cierre", () => {
  const p = plantilla(c);
  assertEquals(p.fuente, "PLANTILLA");
  assertStringIncludes(p.cuerpo, "solicitar el pago de pago primas");
  assertEquals(normalizarRedaccion({ asunto: "" }, c).fuente, "PLANTILLA");
  const r = normalizarRedaccion({ asunto: "Pago de primas", cuerpo: "Me dirijo a usted." }, c);
  assertEquals(r.fuente, "IA");
  assertStringIncludes(r.cuerpo, "Su despacho servirá para disponer el pago correspondiente.");
});

const lineas = [{ orden: 1, beneficiario_doc: "20100047218", serie: "F001", numero: "00001234", monto: 3632.95 }];
const leido = {
  tipo: "factura",
  ruc_emisor: "20100047218",
  razon_social: "X",
  serie: "F001",
  numero: "1234",
  fecha: null,
  moneda: "PEN",
  total: 3632.95,
};

Deno.test("cruce del sustento con las líneas", () => {
  assertEquals(cruzar(leido, lineas), []);
  assertEquals(cruzar({ ...leido, total: 3000 }, lineas), ["El comprobante dice 3000.00 y la línea 1 pide 3632.95."]);
  assertEquals(cruzar({ ...leido, numero: "999" }, lineas), [
    "El comprobante leído (F001-999) no es el de la línea 1 (F001-00001234).",
  ]);
  assertEquals(cruzar({ ...leido, ruc_emisor: "20131312955" }, lineas), [
    "El RUC del comprobante (20131312955) no está en ninguna línea del memo.",
  ]);
  assertEquals(cruzar({ ...leido, tipo: "contrato" }, lineas), []);
});
