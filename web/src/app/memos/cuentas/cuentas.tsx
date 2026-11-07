"use client";

import { useCallback, useEffect, useState } from "react";
import { FallaDeBase } from "@/lib/errores-de-base";
import { useContextoMemos } from "@/lib/memos";
import type { Persona } from "@/lib/sesion";
import { supabase } from "@/lib/supabase";
import { ConSesion } from "../../marco";
import { Aviso, botonPrincipal, botonSecundario } from "../../piezas";
import { Encabezado, Tarjeta } from "../piezas-memo";

export function CuentasPorVerificar() {
  return <ConSesion activo="cuentas">{(persona) => <Contenido persona={persona} />}</ConSesion>;
}

type Pendiente = {
  id: string;
  identificador: string;
  titular: string | null;
  banco: string | null;
  cuenta: string;
  cci: string;
  motivo: string | null;
  registrada_por: string | null;
  memo_id: string | null;
  actualizado_en: string;
};

/**
 * La bandeja del verificador: cuentas nuevas o distintas que ingresaron los
 * emisores. Verificada, vale para la próxima vez; rechazada, no se paga.
 */
function Contenido({ persona }: { persona: Persona }) {
  const { contexto } = useContextoMemos(persona.correo);
  const [lista, setLista] = useState<Pendiente[] | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const permitido = persona.es_administracion || contexto?.permisos.verificaCuentas;

  const leer = useCallback(() => {
    supabase()
      .from("cuentas_bancarias")
      .select("id, identificador, titular, banco, cuenta, cci, motivo, registrada_por, memo_id, actualizado_en")
      .eq("estado", "pendiente")
      .order("actualizado_en")
      .then(({ data, error }) => (error ? setFalla(new FallaDeBase(error).message) : setLista(data as Pendiente[])));
  }, [setFalla, setLista]);
  useEffect(() => {
    if (permitido) leer();
  }, [permitido, leer]);

  const decidir = async (id: string, aprobar: boolean) => {
    const { error } = await supabase().rpc("decidir_cuenta", { cid: id, aprobar });
    if (error) setFalla(new FallaDeBase(error).message);
    leer();
  };

  if (contexto && !permitido) return <Aviso tono="info">Esta bandeja es de quien verifica las cuentas bancarias.</Aviso>;

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Cuentas por verificar"
        descripcion="Cuentas nuevas o distintas a las registradas que se ingresaron en un memo. Confírmalas por un segundo canal antes de verificarlas."
      />
      {falla && <Aviso>{falla}</Aviso>}
      <Tarjeta titulo="Pendientes" nota={lista ? `${lista.length}` : ""}>
        {!lista ? (
          <span className="hueco h-16 w-full" />
        ) : lista.length === 0 ? (
          <p className="text-[13px] text-ink-3">No hay cuentas por verificar.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-60 flex-1">
                  <b className="font-semibold text-ink">{c.titular ?? c.identificador}</b>
                  <span className="block text-[12px] text-ink-3">
                    {c.identificador} · {c.banco ?? "banco sin indicar"} {c.cuenta || c.cci} ·{" "}
                    {c.motivo === "discrepancia" ? "distinta a la registrada" : "beneficiario nuevo"} · la ingresó {c.registrada_por ?? "—"}
                  </span>
                </span>
                {c.memo_id && (
                  <a href={`../memo/?id=${c.memo_id}`} className="text-[12.5px] font-semibold text-primary hover:underline">
                    Ver el memo
                  </a>
                )}
                <button type="button" className={`text-[13px] ${botonPrincipal}`} onClick={() => decidir(c.id, true)}>
                  Verificar
                </button>
                <button type="button" className={`text-[13px] ${botonSecundario}`} onClick={() => decidir(c.id, false)}>
                  Rechazar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
