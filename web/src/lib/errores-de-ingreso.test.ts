import { describe, expect, it } from "vitest";
import { mensajeDeIngreso, paramsDeRetorno } from "./errores-de-ingreso";

const retorno = (url: string) => mensajeDeIngreso(paramsDeRetorno(url));
const BASE = "https://inroprin-apps.github.io/InroMemos/web/";

describe("mensajes del retorno de Google", () => {
  it("sin error no hay mensaje", () => {
    expect(retorno(BASE)).toBeNull();
    expect(retorno(`${BASE}?code=abc123`)).toBeNull();
  });

  it("una cuenta que no es de la empresa recibe un mensaje claro, no el genérico de Supabase", () => {
    const msg = retorno(`${BASE}?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user`);
    expect(msg).toContain("@inroprin.com");
    expect(msg).not.toMatch(/database/i);
  });

  it("lee el error también cuando viene en el fragmento", () => {
    expect(retorno(`${BASE}#error=server_error&error_description=Database%20error%20saving%20new%20user`)).toContain("@inroprin.com");
  });

  it("cancelar en Google no se presenta como una falla", () => {
    expect(retorno(`${BASE}?error=access_denied&error_description=The+user+denied+access`)).toMatch(/cancel/i);
  });

  it("cualquier otro error se muestra tal cual, para poder diagnosticarlo", () => {
    expect(retorno(`${BASE}?error=invalid_request&error_description=Unsupported+provider`)).toContain("Unsupported provider");
  });
});
