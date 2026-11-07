"use client";

import { useEffect, useState } from "react";
import { leerParaReporte, leerPersonas, type FilaReporte } from "@/lib/admin";
import { useCatalogos } from "@/lib/catalogos";
import { tipoCorto } from "@/lib/comprobante";
import { soles } from "@/lib/cuentas";
import { descargarTabla } from "@/lib/hoja-excel";
import { ESTADOS_REPORTE, agrupar, type Agrupar } from "@/lib/reportes";
import type { Catalogos as Listas } from "@/lib/tipos";
import { PaginaAdmin, cabeceraAdmin, tablaAdmin } from "../administracion";
import { IconoBajar } from "../iconos";
import { Indicador, Pestanita } from "../mis-rendiciones";
import { Aviso, botonSecundario, campo } from "../piezas";

export function Reportes() {
  return (
    <PaginaAdmin activo="reportes" titulo="Reportes" descripcion="Cuánto se gastó, en qué y dónde, por fecha del comprobante.">
      {() => <Contenido />}
    </PaginaAdmin>
  );
}

const POR: { clave: Agrupar; texto: string }[] = [
  { clave: "proyecto", texto: "Proyecto" },
  { clave: "area", texto: "Área" },
  { clave: "concepto", texto: "Concepto" },
  { clave: "persona", texto: "Responsable" },
  { clave: "mes", texto: "Mes" },
  { clave: "tipo", texto: "Tipo de comprobante" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const hoy = () => new Date().toLocaleDateString("en-CA");
const inicioDeAno = () => `${new Date().getFullYear()}-01-01`;

function Contenido() {
  const { catalogos } = useCatalogos();
  const [desde, setDesde] = useState(inicioDeAno());
  const [hasta, setHasta] = useState(hoy());
  const [estados, setEstados] = useState<keyof typeof ESTADOS_REPORTE>("revisadas");
  const [por, setPor] = useState<Agrupar>("proyecto");
  const [filas, setFilas] = useState<FilaReporte[] | null>(null);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([leerParaReporte(desde, hasta), leerPersonas()]).then(
      ([f, p]) => {
        if (!vigente) return;
        setFilas(f);
        setNombres(new Map(p.map((x) => [x.id, x.nombre || x.correo])));
        setError(null);
      },
      (e: Error) => vigente && setError(e.message),
    );
    return () => {
      vigente = false;
    };
  }, [desde, hasta]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!filas || !catalogos) return <p className="text-ink-3">Cargando…</p>;

  const grupos = agrupar(filas, por, ESTADOS_REPORTE[estados]);
  const nombre = (clave: string) => nombreDe(clave, por, catalogos, nombres);
  const totalSoles = grupos.reduce((s, g) => s + g.soles, 0);
  const totalDolares = grupos.reduce((s, g) => s + g.dolares, 0);
  const cuantos = grupos.reduce((s, g) => s + g.cuantos, 0);
  const mayor = Math.max(1, ...grupos.map((g) => g.soles));

  const excel = () =>
    descargarTabla(
      `Reporte por ${POR.find((p) => p.clave === por)?.texto.toLowerCase()} ${desde} a ${hasta}`,
      [POR.find((p) => p.clave === por)!.texto.toUpperCase(), "COMPROBANTES", "TOTAL S/", "TOTAL US$"],
      grupos.map((g) => [nombre(g.clave), g.cuantos, g.soles, g.dolares || null]),
    );

  return (
    <>
      <section className="flex flex-wrap items-end gap-3 rounded-card border border-control bg-surface p-4">
        <label className="block text-sm font-medium text-ink-2">
          Desde
          <input type="date" className={`mt-1 ${campo}`} value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          Hasta
          <input type="date" className={`mt-1 ${campo}`} value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          Rendiciones
          <select className={`mt-1 ${campo}`} value={estados} onChange={(e) => setEstados(e.target.value as keyof typeof ESTADOS_REPORTE)}>
            <option value="revisadas">Enviadas y aprobadas</option>
            <option value="aprobadas">Solo aprobadas</option>
            <option value="todas">Todas, también las abiertas</option>
          </select>
        </label>
        <button type="button" onClick={excel} disabled={!grupos.length} className={`ml-auto flex items-center gap-2 ${botonSecundario}`}>
          <IconoBajar className="h-4 w-4" />
          Excel
        </button>
      </section>

      <section aria-label="Totales" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador titulo="Total en soles" valor={soles(totalSoles)} detalle={`${cuantos} comprobante${cuantos === 1 ? "" : "s"}`} />
        <Indicador titulo="En dólares" valor={`US$ ${totalDolares.toFixed(2)}`} detalle="Se muestran aparte, sin convertir" />
        <Indicador titulo="Grupos" valor={String(grupos.length)} detalle={`Por ${POR.find((p) => p.clave === por)?.texto.toLowerCase()}`} />
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-control bg-surface p-4">
        <div role="tablist" aria-label="Agrupar por" className="flex flex-wrap gap-1.5">
          {POR.map((p) => (
            <Pestanita key={p.clave} activa={por === p.clave} onClick={() => setPor(p.clave)}>
              {p.texto}
            </Pestanita>
          ))}
        </div>
        {grupos.length === 0 ? (
          <p className="py-6 text-center text-ink-2">No hay comprobantes en ese periodo.</p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className={`${tablaAdmin} min-w-[640px]`}>
              <thead>
                <tr className={cabeceraAdmin}>
                  <th scope="col" className="px-3 py-2.5">{POR.find((p) => p.clave === por)?.texto}</th>
                  <th scope="col" className="w-32 px-3 py-2.5 text-right">Comprobantes</th>
                  <th scope="col" className="w-[38%] px-3 py-2.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.clave} className="border-t border-line">
                    <td className={`px-3 py-2.5 ${g.clave ? "font-medium" : "italic text-ink-3"}`}>{nombre(g.clave)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{g.cuantos}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-3">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                          <span className="block h-full bg-primary" style={{ width: `${(g.soles / mayor) * 100}%` }} />
                        </span>
                        <span className="w-28 text-right font-semibold tabular-nums">{soles(g.soles)}</span>
                      </span>
                      {g.dolares > 0 && <span className="block text-right text-xs text-ink-3">y US$ {g.dolares.toFixed(2)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-bold">
                  <td className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{cuantos}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{soles(totalSoles)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function nombreDe(clave: string, por: Agrupar, c: Listas, personas: Map<string, string>): string {
  if (!clave) return por === "persona" ? "Sin responsable" : `Sin ${POR.find((p) => p.clave === por)?.texto.toLowerCase()}`;
  const de = (l: { id: number | string; nombre: string }[]) => l.find((x) => String(x.id) === clave)?.nombre ?? clave;
  switch (por) {
    case "proyecto":
      return de(c.proyectos);
    case "area":
      return de(c.areas);
    case "concepto":
      return de(c.conceptos);
    case "tipo":
      return tipoCorto(clave, c.tipos.find((t) => t.id === clave)?.nombre);
    case "persona":
      return personas.get(clave) ?? "Otra persona";
    case "mes": {
      const [a, m] = clave.split("-");
      return `${MESES[Number(m) - 1]} ${a}`;
    }
  }
}
