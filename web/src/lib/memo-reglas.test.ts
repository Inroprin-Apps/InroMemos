import { describe, expect, it } from "vitest";
import {
  periodoViaje,
  bancoCanonico,
  comprobante,
  enmascarar,
  idTecnico,
  monto,
  numeroVisible,
  proximoCiclo,
  revisarCci,
  rucValido,
  textoCorte,
  textoDia,
  tipoDocumento,
} from "./memo-reglas";

describe("RUC y DNI", () => {
  it("acepta un RUC con su dígito verificador", () => {
    expect(rucValido("20100047218")).toBe(true);
    expect(rucValido("20131312955")).toBe(true);
  });
  it("rechaza un dígito equivocado, un prefijo raro o un largo distinto", () => {
    expect(rucValido("20100047219")).toBe(false);
    expect(rucValido("30100047218")).toBe(false);
    expect(rucValido("2010004721")).toBe(false);
  });
  it("reconoce el tipo de documento por su forma", () => {
    expect(tipoDocumento("20100047218")).toBe("RUC");
    expect(tipoDocumento("45678912")).toBe("DNI");
    expect(tipoDocumento("I00001A")).toBe("OTRO");
  });
});

describe("bancos y cuentas", () => {
  it("nombre canónico del banco", () => {
    expect(bancoCanonico("Banco de Crédito del Perú (BCP)")).toBe("BCP");
    expect(bancoCanonico("bbva continental")).toBe("BBVA");
    expect(bancoCanonico("Banco de la Nación")).toBe("BANCO DE LA NACION");
    expect(bancoCanonico("Banco Fantasma")).toBeNull();
  });
  it("el CCI tiene 20 dígitos y su prefijo dice el banco", () => {
    expect(revisarCci("002-191-001234567890-12")).toEqual({ valido: true, banco: "BCP", aviso: null });
    expect(revisarCci("1234").valido).toBe(false);
  });
  it("avisa si el CCI es de otro banco que el declarado", () => {
    expect(revisarCci("00219100123456789012", "BBVA").aviso).toBe("El CCI es de BCP, pero el banco dice BBVA.");
  });
  it("una cuenta se muestra con sus últimos 4 dígitos", () => {
    expect(enmascarar("191-12345678-0-21")).toBe("••••8021");
    expect(enmascarar("12")).toBe("12");
  });
});

describe("comprobantes y montos", () => {
  it("normaliza serie y número", () => {
    expect(comprobante(" f001 - 599 ")).toEqual({ serie: "F001", numero: "00000599", texto: "F001-00000599", clave: "F001-599" });
    expect(comprobante("F001-00000599")?.clave).toBe("F001-599");
    expect(comprobante("0001-003936")?.clave).toBe("1-3936");
    expect(comprobante("sin número")).toBeNull();
  });
  it("lee montos como los escribe la gente", () => {
    expect(monto("S/ 1,799.00")).toBe(1799);
    expect(monto("1.799,00")).toBe(1799);
    expect(monto("12,5")).toBe(12.5);
    expect(monto("3632.95")).toBe(3632.95);
    expect(monto("1,500")).toBe(1500);
    expect(monto("abc")).toBeNull();
  });
});

describe("número del memo", () => {
  it("visible y técnico", () => {
    const v = numeroVisible(29, 2026, "FINANZAS");
    expect(v).toBe("029-2026-FINANZAS");
    expect(idTecnico("INR", v)).toBe("INR|029-2026-FINANZAS");
    expect(numeroVisible(625, 2026, "RRHH")).toBe("625-2026-RRHH");
  });
});

describe("corte lunes y miércoles 16:00, pago martes y jueves", () => {
  // Hora de Lima = UTC-5: las 16:00 de Lima son las 21:00 UTC.
  const lima = (iso: string) => new Date(`${iso}-05:00`);

  it("el sábado entra al corte del lunes y se paga el martes", () => {
    const c = proximoCiclo(lima("2026-11-07T10:00:00"));
    expect(c.corte.toISOString()).toBe("2026-11-09T21:00:00.000Z");
    expect(textoCorte(c.corte)).toBe("lunes 9 nov, 4:00 pm");
    expect(textoDia(c.pago)).toBe("martes 10 nov");
  });
  it("el lunes a las 15:59 todavía entra", () => {
    expect(textoCorte(proximoCiclo(lima("2026-11-09T15:59:00")).corte)).toBe("lunes 9 nov, 4:00 pm");
  });
  it("a las 16:00 exactas ya no: pasa al miércoles", () => {
    const c = proximoCiclo(lima("2026-11-09T16:00:00"));
    expect(textoCorte(c.corte)).toBe("miércoles 11 nov, 4:00 pm");
    expect(textoDia(c.pago)).toBe("jueves 12 nov");
  });
  it("el miércoles en la noche pasa al lunes siguiente", () => {
    expect(textoCorte(proximoCiclo(lima("2026-11-11T20:00:00")).corte)).toBe("lunes 16 nov, 4:00 pm");
  });
});

describe("periodo del viaje", () => {
  it("con el año una sola vez si es el mismo", () => {
    expect(periodoViaje("2026-11-03", "2026-11-08")).toBe("03/11 al 08/11/2026");
  });
  it("con los dos años si cruza el año", () => {
    expect(periodoViaje("2026-12-28", "2027-01-03")).toBe("28/12/2026 al 03/01/2027");
  });
  it("con una sola fecha o ninguna", () => {
    expect(periodoViaje("2026-11-03", null)).toBe("desde el 03/11/2026");
    expect(periodoViaje(null, null)).toBe("");
  });
});
