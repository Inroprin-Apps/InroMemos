import { describe, expect, it } from "vitest";
import { corrido, lineaDeTiempo } from "./memo-linea";
import type { Evento, Memo } from "./memos";

const memo = (m: Partial<Memo>): Memo =>
  ({
    estado: "borrador",
    estado_pago: null,
    requiere_pago: false,
    emitido_en: null,
    aprobado_en: null,
    enviado_en: null,
    recibido_en: null,
    emisor_nombre: "Grama",
    destinatario_nombre: "Tomas",
    destinatario_correo: "t@inroprin.com",
    codigo_sello: null,
    valoracion: null,
    motivo_anulacion: "",
    ...m,
  }) as Memo;

let n = 0;
const ev = (tipo: string, en: string, detalle: Record<string, unknown> = {}, actor_nombre = ""): Evento =>
  ({ id: ++n, tipo, en, detalle, actor_nombre, estado_antes: null, estado_despues: null }) as Evento;

describe("línea de tiempo del memo", () => {
  it("un memo emitido espera la aprobación como siguiente paso", () => {
    const l = lineaDeTiempo(memo({ estado: "pendiente", emitido_en: "2026-11-09T14:00:00Z" }), [ev("emitido", "2026-11-09T14:00:00Z")]);
    expect(l.pasos.map((p) => [p.titulo, p.estado])).toEqual([
      ["Emitido", "hecho"],
      ["Aprobado", "siguiente"],
      ["Enviado al destinatario", "pendiente"],
      ["Cargo recibido", "pendiente"],
    ]);
    expect(l.siguiente).toBe("Aprobado");
    expect([l.hechos, l.total]).toEqual([1, 4]);
  });

  it("con pago sigue hasta pagado, y una observación aparece en su momento", () => {
    const l = lineaDeTiempo(
      memo({
        estado: "recibido",
        requiere_pago: true,
        estado_pago: "registrado",
        emitido_en: "2026-11-02T14:00:00Z",
        aprobado_en: "2026-11-03T14:00:00Z",
        enviado_en: "2026-11-03T14:05:00Z",
        recibido_en: "2026-11-04T10:00:00Z",
        codigo_sello: "7F3A-91C2",
      }),
      [
        ev("emitido", "2026-11-01T14:00:00Z"),
        ev("observado", "2026-11-01T18:00:00Z", { comentario: "Falta la factura" }, "Jefa"),
        ev("emitido", "2026-11-02T14:00:00Z"),
        ev("aprobado", "2026-11-03T14:00:00Z", {}, "Jefa"),
        ev("pago", "2026-11-05T10:00:00Z", { despues: "en_analisis" }),
        ev("pago", "2026-11-06T10:00:00Z", { despues: "registrado" }),
      ],
    );
    expect(l.pasos.map((p) => p.titulo)).toEqual([
      "Observado",
      "Emitido",
      "Aprobado",
      "Enviado al destinatario",
      "Cargo recibido",
      "En análisis (Finanzas)",
      "Registrado en RG",
      "Programado para pago",
      "Pagado",
    ]);
    expect(l.pasos[0]).toMatchObject({ estado: "alerta", detalle: "Falta la factura", quien: "Jefa" });
    expect(l.pasos[2]).toMatchObject({ quien: "Jefa", detalle: "código 7F3A-91C2" });
    expect(l.siguiente).toBe("Programado para pago");
    expect([l.hechos, l.total]).toEqual([6, 8]);
  });

  it("un memo anulado termina ahí, sin pasos por delante", () => {
    const l = lineaDeTiempo(
      memo({ estado: "anulado", emitido_en: "2026-11-02T14:00:00Z", motivo_anulacion: "Duplicado" }),
      [ev("emitido", "2026-11-02T14:00:00Z"), ev("anulado", "2026-11-02T15:00:00Z")],
    );
    expect(l.pasos.map((p) => p.titulo)).toEqual(["Emitido", "Anulado"]);
    expect(l.siguiente).toBeNull();
  });

  it("los días corridos entre pasos", () => {
    expect(corrido("2026-11-01T10:00:00Z", "2026-11-01T10:20:00Z")).toBe("20 min");
    expect(corrido("2026-11-01T10:00:00Z", "2026-11-01T15:00:00Z")).toBe("5 h");
    expect(corrido("2026-11-01T10:00:00Z", "2026-11-04T09:00:00Z")).toBe("2 d");
    expect(corrido(null, "2026-11-04T09:00:00Z")).toBeNull();
  });
});
