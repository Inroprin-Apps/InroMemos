import { assertEquals } from "jsr:@std/assert@1.0.14";
import { bearer, idTecnicoDe, iguales, sha256, tokenNuevo } from "./reglas.ts";

Deno.test("token: nuevo, largo, y se guarda solo su huella", async () => {
  const t = tokenNuevo();
  assertEquals(t.length >= 40, true);
  assertEquals(bearer(`Bearer ${t}`), t);
  assertEquals(bearer("Bearer corto"), "");
  assertEquals((await sha256("abc")).slice(0, 8), "ba7816bf");
  assertEquals(iguales("abc", "abc"), true);
  assertEquals(iguales("abc", "abd"), false);
});

Deno.test("el memo de un estado: por id técnico o por id de línea", () => {
  assertEquals(idTecnicoDe("INR|029-2026-FINANZAS"), "INR|029-2026-FINANZAS");
  assertEquals(idTecnicoDe("INR|029-2026-FINANZAS|L01|v2"), "INR|029-2026-FINANZAS");
  assertEquals(idTecnicoDe("IPL|006-2026-COMPRAS-NACIONALES|L03"), "IPL|006-2026-COMPRAS-NACIONALES");
  assertEquals(idTecnicoDe("cualquier cosa"), null);
});
