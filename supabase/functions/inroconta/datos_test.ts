import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { fecha, filaContribuyente, filaSire, filaSsco, leerConjunto, tandas } from "./datos.ts";

Deno.test("una fila del padrón pasa a contribuyentes, y un RUC raro se descarta", () => {
  assertEquals(
    filaContribuyente({
      ruc: " 20100047218 ",
      razon_social: "BANCO DE CREDITO DEL PERU",
      estado: "activo",
      condicion: "habido",
      tipo_contribuyente: "SOCIEDAD ANONIMA",
      buen_contribuyente: true,
      agente_retencion: true,
    }),
    {
      ruc: "20100047218",
      razon_social: "BANCO DE CREDITO DEL PERU",
      estado: "ACTIVO",
      condicion: "HABIDO",
      tipo_contribuyente: "SOCIEDAD ANONIMA",
      buen_contribuyente: true,
      agente_retencion: true,
    },
  );
  assertEquals(
    filaContribuyente({
      ruc: "123",
      razon_social: null,
      estado: null,
      condicion: null,
      tipo_contribuyente: null,
      buen_contribuyente: null,
      agente_retencion: null,
    }),
    null,
  );
});

Deno.test("SSCO: la fecha firme manda; si no hay, la de publicación", () => {
  assertEquals(
    filaSsco({
      ruc: "20131312955",
      razon_social: "X SAC",
      resolucion: "RS 1",
      firme_desde: null,
      publicado_el: "05/10/2026",
    }),
    { ruc: "20131312955", razon_social: "X SAC", ssco_resolucion: "RS 1", ssco_desde: "2026-10-05" },
  );
  assertEquals(fecha("2026-10-05T00:00:00Z"), "2026-10-05");
  assertEquals(fecha("ayer"), null);
});

Deno.test("SIRE: tipo de dos cifras, total redondeado y si ya está en CONCAR", () => {
  const f = filaSire({
    periodo: 202611,
    proveedor_ruc: "20100047218",
    proveedor_nombre: "BCP",
    tipo_comprobante: "1",
    serie: "f001",
    numero: "777",
    fecha_emision: "2026-11-03",
    moneda: "PEN",
    total: 500.004,
    estado: "1",
    oc: ["0200-2026"],
    centro_costo: ["PROY-2024-032"],
    concar: [{ periodo: 202611, asiento: "11-080001", total: 500, diferencia: 0 }],
  });
  assertEquals(f?.tipo, "01");
  assertEquals(f?.serie, "F001");
  assertEquals(f?.total, 500);
  assertEquals(f?.en_concar, true);
  assertEquals(f?.oc, ["0200-2026"]);
});

Deno.test("tandas de 500", () => {
  assertEquals([...tandas(Array.from({ length: 1201 }, (_, i) => i))].map((t) => t.length), [500, 500, 201]);
});

function falso(paginas: Record<number, unknown>, status = 200): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    const p = Number(new URL(url).searchParams.get("pagina"));
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== "Bearer t0k3n") return Promise.resolve(new Response("", { status: 401 }));
    return Promise.resolve(new Response(JSON.stringify(paginas[p]), { status }));
  }) as typeof fetch;
}

Deno.test("lee todas las páginas hasta que siguiente es null", async () => {
  const f = falso({
    0: { conjunto: "ssco", pagina: 0, filas: [1, 2], siguiente: 1, leido_en: "" },
    1: { conjunto: "ssco", pagina: 1, filas: [3], siguiente: null, leido_en: "" },
  });
  assertEquals(await leerConjunto(f, "https://inroconta.example/", "t0k3n", "ssco"), [1, 2, 3]);
});

Deno.test("explica en palabras un token rechazado, un error o una respuesta rara", async () => {
  await assertRejects(() => leerConjunto(falso({}), "https://x", "otro", "padron"), Error, "rechazó el token");
  await assertRejects(() => leerConjunto(falso({}, 500), "https://x", "t0k3n", "padron"), Error, "respondió 500");
  await assertRejects(
    () => leerConjunto(falso({ 0: { conjunto: "sire", filas: [] } }), "https://x", "t0k3n", "padron"),
    Error,
    "no tiene la forma esperada",
  );
  await assertRejects(
    () =>
      leerConjunto(
        falso({ 0: { conjunto: "padron", pagina: 0, filas: [], siguiente: 0 } }),
        "https://x",
        "t0k3n",
        "padron",
      ),
    Error,
    "página siguiente inválida",
  );
});
