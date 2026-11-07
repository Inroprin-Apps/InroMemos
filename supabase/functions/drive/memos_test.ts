import {
  assert,
  assertEquals,
  assertMatch,
  assertNotEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1.0.14";
import { htmlMemo, nombreCarpeta, rutaMemo } from "./memo.ts";
import { armarCorreo, mensajeCrudo } from "./correo.ts";
import { comparar, huella, identificador, leerBase, mascara } from "./cuentas.ts";

const memo = {
  numero_visible: "029-2026-FINANZAS",
  asunto: "Pago de prima por renovación de CF",
  cuerpo:
    "Me dirijo a usted <b>a fin</b> de solicitar el pago.\n\nSu despacho servirá para disponer el pago correspondiente.",
  emisor_nombre: "Ana Torres",
  destinatario_nombre: "Marieu García",
  destinatario_correo: "marieu@inroprin.com",
  copias: [],
  confidencialidad: "normal" as const,
  requiere_pago: true,
  moneda: "PEN",
  emitido_en: "2026-11-06T15:00:00Z",
  aprobado_en: "2026-11-06T17:00:00Z",
  codigo_sello: "7F3A-91C2",
  version: 1,
};
const linea = {
  beneficiario: "CESCE PERÚ S.A.",
  beneficiario_doc: "20100047218",
  serie: "F001",
  numero: "00001234",
  banco: "BCP",
  cuenta: "••••4521",
  cci: "",
  monto: 3632.95,
  moneda: "PEN",
};

Deno.test("el papel del memo: encabezado, tabla con cuenta enmascarada, sello y texto escapado", () => {
  const h = htmlMemo(memo, [linea, { ...linea, monto: 100 }], {
    empresa: "INROPRIN",
    unidad: "Finanzas",
    aprobador: "Jefa",
    logo: null,
  });
  assertStringIncludes(h, "MEMORÁNDUM 029-2026-FINANZAS");
  assertStringIncludes(h, "BCP ••••4521");
  assertStringIncludes(h, "S/ 3,732.95");
  assertStringIncludes(h, "código <b>7F3A-91C2</b>");
  assertStringIncludes(h, "&lt;b&gt;a fin&lt;/b&gt;");
  assertStringIncludes(h, "Lima, 6 de noviembre de 2026");
});

Deno.test("un memo reservado no lista personas: solo el total", () => {
  const h = htmlMemo({ ...memo, confidencialidad: "confidencial" }, [linea], {
    empresa: "INROPRIN",
    unidad: "RRHH",
    aprobador: null,
    logo: null,
  });
  assert(!h.includes("CESCE"));
  assertStringIncludes(h, "anexo de acceso restringido");
});

Deno.test("carpeta del memo: sin caracteres prohibidos, hasta 90", () => {
  assertEquals(nombreCarpeta("029-2026-FINANZAS", 'Pago "urgente" a/b: CESCE'), "MEMO 029-2026 Pago urgente a b CESCE");
  assert(nombreCarpeta("001-2026-RRHH", "x".repeat(200)).length <= 90);
  assertEquals(rutaMemo("INROPRIN", "Finanzas", 2026), ["Memos", "INROPRIN", "Finanzas", "2026"]);
});

const aviso = { tipo: "aprobado", para: ["marieu@inroprin.com"], copia: ["ana@inroprin.com"], fuera_de_meta: false };
const m = {
  id: "abc",
  numero_visible: "029-2026-FINANZAS",
  asunto: "Pago de prima",
  emisor_nombre: "Ana",
  destinatario_nombre: "Marieu",
  ultima_observacion: "",
  motivo_anulacion: "",
  total: 3632.95,
  moneda: "PEN",
  requiere_pago: true,
};

Deno.test("en modo prueba el correo va solo a la cuenta conectada, y dice a quién iba", () => {
  const c = armarCorreo(aviso, m, { app: "https://x/web/", modo: "prueba", cuentaPrueba: "t@inroprin.com" });
  assertEquals(c.para, ["t@inroprin.com"]);
  assertEquals(c.copia, []);
  assertMatch(c.asunto, /^\[PRUEBA\] Memo 029-2026-FINANZAS/);
  assertStringIncludes(c.html, "iba para marieu@inroprin.com");
  assertStringIncludes(c.html, "https://x/web/memos/memo/?id=abc");
});

Deno.test("en modo real va a los destinatarios; fuera de meta se marca", () => {
  const c = armarCorreo({ ...aviso, fuera_de_meta: true }, m, {
    app: "https://x",
    modo: "real",
    cuentaPrueba: "t@inroprin.com",
  });
  assertEquals(c.para, ["marieu@inroprin.com"]);
  assertEquals(c.copia, ["ana@inroprin.com"]);
  assertMatch(c.asunto, /^\[FUERA DE META\]/);
  const crudo = mensajeCrudo(c, "t@inroprin.com", "ana@inroprin.com");
  assertStringIncludes(crudo, "To: marieu@inroprin.com");
  assertStringIncludes(crudo, "Reply-To: ana@inroprin.com");
  assertStringIncludes(crudo, "Subject: [FUERA DE META] Memo 029-2026-FINANZAS: Pago de prima");
  const conTilde = armarCorreo(aviso, { ...m, asunto: "Renovación" }, {
    app: "https://x",
    modo: "real",
    cuentaPrueba: "t",
  });
  assertStringIncludes(mensajeCrudo(conTilde, "t@inroprin.com"), "Subject: =?UTF-8?B?");
});

Deno.test("bases de cuentas: por encabezado, con la fila de títulos donde esté", () => {
  const rrhh = [
    ["BASE DE PERSONAL"],
    [],
    [""],
    ["DNI", "APELLIDOS Y NOMBRES", "BANCO - PLANILLA", "CUENTA - PLANILLA", "CCI  PLANILLA", "DNI"],
    ["04567891", "Pérez Juan", "BCP", "191-12345678-0-21", "00219100123456780214", "x"],
    ["", "sin dni", "BCP", "123456789", "", ""],
  ];
  const c = leerBase(rrhh, "RRHH");
  assertEquals(c.length, 1);
  assertEquals(c[0].identificador, "4567891");
  assertEquals(c[0].tipo, "PLANILLA");
  assertEquals(c[0].cci, "00219100123456780214");
  assertThrows(() => leerBase([["NADA"]], "NACIONAL"), Error, "No encuentro la columna RUC");
  const nac = [[
    "RUC",
    "RAZON SOCIAL",
    "BANCO",
    "MONEDA",
    "NÚMERO DE CTA",
    "CCI",
    "BANCO 2",
    "NÚMERO DE CTA 2",
    "CTA DETRACCIÓN",
  ], [
    "20100047218",
    "Proveedor",
    "BCP",
    "PEN",
    "1911234567",
    "",
    "BBVA",
    "0011-0123-4567",
    "00-123-456789",
  ]];
  assertEquals(leerBase(nac, "NACIONAL").map((x) => x.tipo), ["PRINCIPAL", "SECUNDARIA", "DETRACCION"]);
});

Deno.test("huella: la misma cuenta con o sin guiones da la misma; otra clave, otra huella", async () => {
  const a = await huella("clave-secreta-de-prueba-0123456789", "191-12345678-0-21");
  const b = await huella("clave-secreta-de-prueba-0123456789", "1911234567802 1");
  const c = await huella("otra-clave-secreta-de-prueba-01234", "191-12345678-0-21");
  assertEquals(a, b);
  assertNotEquals(a, c);
  assertMatch(a!, /^[0-9a-f]{64}$/);
  assertEquals(await huella("k", "12"), null);
  assertEquals(mascara("191-12345678-0-21"), "••••8021");
  assertEquals(identificador("0045678912"), "45678912");
});

Deno.test("comparar una cuenta con lo registrado", () => {
  const reg = [{ huella_cuenta: "a", huella_cci: null, estado: "verificada" }, {
    huella_cuenta: "b",
    huella_cci: null,
    estado: "pendiente",
  }];
  assertEquals(comparar(reg, "a", null), "coincide");
  assertEquals(comparar(reg, "b", null), "pendiente");
  assertEquals(comparar(reg, "c", null), "distinta");
  assertEquals(comparar([], "c", null), "no_registrada");
  assertEquals(comparar(reg, null, null), "datos_incompletos");
  assertEquals(comparar([{ huella_cuenta: "a", huella_cci: null, estado: "rechazada" }], "a", null), "no_registrada");
});
