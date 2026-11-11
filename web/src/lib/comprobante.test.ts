import { describe, expect, it } from "vitest";
import { estadoFila, faltan, fueraDelViaje, herencia, numeroCompleto, partirNumero, tipoCorto } from "./comprobante";

describe("número de comprobante", () => {
  it("separa serie y número, conservando lo que se tecleó", () => {
    expect(partirNumero("f001-006384")).toEqual({ serie: "F001", numero: "006384" });
    expect(partirNumero(" 0001 - 003936 ")).toEqual({ serie: "0001", numero: "003936" });
  });

  it("una planilla sin guion no inventa serie", () => {
    expect(partirNumero("010010")).toEqual({ serie: "", numero: "010010" });
  });

  it("se vuelve a escribir igual", () => {
    expect(numeroCompleto({ serie: "F001", numero: "6384" })).toBe("F001-6384");
    expect(numeroCompleto({ serie: "", numero: "010010" })).toBe("010010");
  });
});

describe("qué le falta a una fila", () => {
  const completa = {
    fecha: "2026-10-20",
    tipo_comprobante_id: "BOLETA",
    numero: "123",
    total: 10,
    proyecto_id: 1,
    concepto_id: 1,
    descartado: false,
  };

  it("una fila completa no tiene faltantes", () => {
    expect(faltan(completa)).toEqual([]);
  });

  it("nombra lo que falta", () => {
    expect(faltan({ ...completa, fecha: null, total: null, concepto_id: null })).toEqual([
      "fecha",
      "total",
      "concepto",
    ]);
  });

  it("la declaración jurada no lleva número", () => {
    expect(faltan({ ...completa, tipo_comprobante_id: "DJ", numero: "" })).toEqual([]);
    expect(faltan({ ...completa, numero: "" })).toEqual(["número"]);
  });

  it("un total de cero es un dato, no un faltante", () => {
    expect(faltan({ ...completa, total: 0 })).toEqual([]);
  });

  it("lo descartado no bloquea el envío", () => {
    expect(faltan({ ...completa, fecha: null, descartado: true })).toEqual([]);
  });
});

describe("herencia de una fila nueva", () => {
  const persona = { nombre: "Ana Pérez", area_id: 3 };
  const fila = (proyecto_id: number | null, area_id: number | null, solicitante: string, descartado = false) => ({
    proyecto_id, area_id, solicitante, descartado,
  });

  it("en un memo: proyecto de la última fila, área y solicitante de quien viaja", () => {
    expect(herencia([fila(1, 9, "OTRO"), fila(2, 9, "OTRO")], "memo", persona)).toEqual({
      proyecto_id: 2, area_id: 3, solicitante: "Ana Pérez",
    });
  });

  it("en una caja: todo de la última fila llenada, saltando descartadas y vacías", () => {
    expect(herencia([fila(1, 4, "JUAN"), fila(5, 6, "LUIS", true), fila(null, null, "")], "caja", persona)).toEqual({
      proyecto_id: 1, area_id: 4, solicitante: "JUAN",
    });
  });

  it("sin filas: en blanco (en un memo, los datos de quien viaja)", () => {
    expect(herencia([], "caja", persona)).toEqual({ proyecto_id: null, area_id: null, solicitante: "" });
    expect(herencia([], "memo", persona)).toEqual({ proyecto_id: null, area_id: 3, solicitante: "Ana Pérez" });
  });
});

describe("estado de una fila", () => {
  const completa = {
    fecha: "2026-10-20", tipo_comprobante_id: "BOLETA", numero: "135", total: "45.50",
    proyecto_id: 1, concepto_id: 1, descartado: false, observacion: "", via: "ia",
  };
  it("lo que bloquea va primero", () => {
    expect(estadoFila({ ...completa, descartado: true }).clave).toBe("descartado");
    expect(estadoFila(completa, { estado_lectura: "procesando", error: null }).clave).toBe("leyendo");
    expect(estadoFila(completa, { estado_lectura: "fallido", error: "x" })).toMatchObject({ clave: "fallido", porRevisar: true });
    expect(estadoFila({ ...completa, observacion: "Falta la boleta" })).toMatchObject({ clave: "observado", detalle: "Falta la boleta" });
    expect(estadoFila({ ...completa, proyecto_id: null })).toMatchObject({ texto: "Falta proyecto", porRevisar: true });
    expect(estadoFila({ ...completa, proyecto_id: null, fecha: null }).texto).toBe("Faltan 2 datos");
    expect(estadoFila(completa, undefined, true).clave).toBe("repetido");
    expect(estadoFila(completa)).toEqual({ clave: "listo", texto: "Listo", detalle: "Leído por IA", porRevisar: false });
  });
  it("nombres cortos de tipo", () => {
    expect(tipoCorto("FACTURA")).toBe("Factura");
    expect(tipoCorto(null)).toBe("Sin tipo");
    expect(tipoCorto("NUEVO", "NUEVO TIPO")).toBe("NUEVO TIPO");
  });
});

describe("entrega de viáticos: el viaje y su proyecto", () => {
  const viaje = { viaje_desde: "2026-11-03", viaje_hasta: "2026-11-08" };
  const fila = { fecha: "2026-11-05", tipo_comprobante_id: "BOLETA", numero: "1", total: 10, proyecto_id: 1, concepto_id: 1, descartado: false };

  it("un comprobante dentro del viaje está listo; uno de antes o después, se avisa sin bloquear", () => {
    expect(estadoFila(fila, undefined, false, viaje).clave).toBe("listo");
    const tarde = estadoFila({ ...fila, fecha: "2026-11-10" }, undefined, false, viaje);
    expect([tarde.clave, tarde.texto, tarde.detalle, tarde.porRevisar]).toEqual(["fuera", "Fuera del viaje", "El viaje fue del 03/11 al 08/11", true]);
    expect(faltan({ ...fila, fecha: "2026-11-10" })).toEqual([]);
  });

  it("sin fechas de viaje (caja chica o memo en Word) no hay nada que avisar", () => {
    expect(fueraDelViaje("2026-01-01", null)).toBe(false);
    expect(fueraDelViaje("2026-01-01", { viaje_desde: null, viaje_hasta: null })).toBe(false);
    expect(fueraDelViaje("2026-11-02", { viaje_desde: "2026-11-03", viaje_hasta: null })).toBe(true);
  });

  it("la primera fila arranca con el proyecto del memo de entrega; después manda la última fila", () => {
    const yo = { nombre: "Ana", area_id: 3 };
    expect(herencia([], "memo", yo, 7).proyecto_id).toBe(7);
    expect(herencia([{ proyecto_id: 2, area_id: 3, solicitante: "Ana", descartado: false }], "memo", yo, 7).proyecto_id).toBe(2);
    expect(herencia([], "memo", yo).proyecto_id).toBeNull();
  });
});
