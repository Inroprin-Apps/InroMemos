"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { estadoFila, numeroCompleto, partirNumero, tipoCorto, type EstadoFila } from "@/lib/comprobante";
import { aNumero, soles } from "@/lib/cuentas";
import type { CambiosComprobante } from "@/lib/datos";
import type { Archivo, Catalogos, Comprobante } from "@/lib/tipos";
import { IconoBuscar } from "../iconos";
import { Pestanita } from "../mis-rendiciones";
import { Lista, Miniatura, Texto, celda, celdaChica, celdaFalta, useEnlaces } from "./celdas";

type Filtro = "todos" | "revisar" | "leyendo" | "descartados";

const TONOS: Record<EstadoFila["clave"], string> = {
  listo: "text-success-strong",
  leyendo: "text-primary-strong",
  falta: "text-warning-strong",
  repetido: "text-warning-strong",
  fallido: "text-danger-strong",
  observado: "text-danger-strong",
  descartado: "text-ink-3",
};

export function Hoja({
  rendicionId,
  filas,
  archivos,
  repetidos,
  catalogos,
  editable,
  intento,
  herramientas,
  onGuardar,
  onGuardarVarios,
  onReleer,
}: {
  rendicionId: string;
  filas: Comprobante[];
  archivos: Archivo[];
  repetidos: Map<string, string>;
  catalogos: Catalogos;
  editable: boolean;
  intento: number;
  /** Los botones de subir y agregar, que viven con la lógica de la página. */
  herramientas: ReactNode;
  onGuardar: (id: string, cambios: CambiosComprobante) => void;
  onGuardarVarios: (ids: string[], cambios: CambiosComprobante) => Promise<void>;
  onReleer: (archivoId: string) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const enlaces = useEnlaces(archivos);

  const archivoDe = (c: Comprobante) => archivos.find((a) => a.id === c.archivo_id);
  const conEstado = filas.map((c) => ({ c, e: estadoFila(c, archivoDe(c), repetidos.has(c.id)) }));
  const cuenta = {
    todos: conEstado.filter(({ e }) => e.clave !== "descartado").length,
    revisar: conEstado.filter(({ e }) => e.porRevisar).length,
    leyendo: conEstado.filter(({ e }) => e.clave === "leyendo").length,
    descartados: conEstado.filter(({ e }) => e.clave === "descartado").length,
  };

  const texto = busqueda.trim().toUpperCase();
  const visibles = conEstado.filter(({ c, e }) => {
    if (filtro === "revisar" && !e.porRevisar) return false;
    if (filtro === "leyendo" && e.clave !== "leyendo") return false;
    if (filtro === "descartados" && e.clave !== "descartado") return false;
    if (!texto) return true;
    return [c.proveedor, c.ruc, numeroCompleto(c), c.descripcion, c.solicitante].some((v) => v.toUpperCase().includes(texto));
  });

  // Lo elegido que ya no se ve (por filtro o búsqueda) no se toca.
  const elegidasVisibles = visibles.filter(({ c }) => elegidas.has(c.id)).map(({ c }) => c.id);
  const todasElegidas = visibles.length > 0 && elegidasVisibles.length === visibles.length;
  const alternar = (id: string) =>
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const aplicar = async (cambios: CambiosComprobante) => {
    await onGuardarVarios(elegidasVisibles, cambios);
    setElegidas(new Set());
  };

  // Los dólares no se suman a los soles: se muestran aparte.
  const vigentes = conEstado.filter(({ e }) => e.clave !== "descartado").map(({ c }) => c);
  const total = vigentes.filter((c) => c.moneda !== "USD").reduce((s, c) => s + (c.total == null ? 0 : aNumero(c.total)), 0);
  const dolares = vigentes.filter((c) => c.moneda === "USD").reduce((s, c) => s + (c.total == null ? 0 : aNumero(c.total)), 0);

  return (
    <section aria-label="Comprobantes" className="flex min-w-0 flex-col gap-3 rounded-card border border-control bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div role="tablist" aria-label="Filtrar comprobantes" className="flex flex-wrap gap-1.5">
          <Pestanita activa={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos · {cuenta.todos}
          </Pestanita>
          <Pestanita activa={filtro === "revisar"} onClick={() => setFiltro("revisar")}>
            Por revisar · {cuenta.revisar}
          </Pestanita>
          {cuenta.leyendo > 0 && (
            <Pestanita activa={filtro === "leyendo"} onClick={() => setFiltro("leyendo")}>
              Leyendo · {cuenta.leyendo}
            </Pestanita>
          )}
          {cuenta.descartados > 0 && (
            <Pestanita activa={filtro === "descartados"} onClick={() => setFiltro("descartados")}>
              Descartados · {cuenta.descartados}
            </Pestanita>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-control border border-control px-3 text-ink-3 focus-within:border-primary">
            <IconoBuscar className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor, RUC o N°"
              aria-label="Buscar"
              className="w-full bg-transparent text-sm text-ink outline-none"
            />
          </label>
          {herramientas}
        </div>
      </div>

      {editable && elegidasVisibles.length > 0 && (
        <AccionesEnBloque cuantas={elegidasVisibles.length} catalogos={catalogos} onAplicar={aplicar} onQuitar={() => setElegidas(new Set())} />
      )}

      {visibles.length === 0 ? (
        <p className="px-1 py-6 text-center text-ink-2">
          {filas.length === 0
            ? "Todavía no hay comprobantes. Sube las fotos o PDF: se leen solos (en PC también puedes arrastrarlos a la pantalla)."
            : "Nada con ese filtro."}
        </p>
      ) : (
        <>
          {/* PC: la hoja a todo el ancho. */}
          <div className="hidden overflow-x-auto rounded-control border border-line md:block">
            <table className="w-full min-w-[1040px] border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink-3">
                  <th scope="col" className="w-9 px-2 py-2.5">
                    {editable && (
                      <input
                        type="checkbox"
                        aria-label="Elegir todos"
                        checked={todasElegidas}
                        onChange={() => setElegidas(todasElegidas ? new Set() : new Set(visibles.map(({ c }) => c.id)))}
                      />
                    )}
                  </th>
                  <th scope="col" className="w-12 px-1 py-2.5">Imagen</th>
                  <th scope="col" className="w-30 px-1 py-2.5">Fecha</th>
                  <th scope="col" className="w-30 px-1 py-2.5">Tipo · N°</th>
                  <th scope="col" className="min-w-44 px-1 py-2.5">Proveedor · RUC</th>
                  <th scope="col" className="w-36 px-1 py-2.5">Proyecto</th>
                  <th scope="col" className="w-36 px-1 py-2.5">Área · solicitante</th>
                  <th scope="col" className="min-w-44 px-1 py-2.5">Concepto · motivo</th>
                  <th scope="col" className="w-22 px-1 py-2.5 text-right">Total</th>
                  <th scope="col" className="w-30 px-2 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ c, e }) => (
                  <Fila
                    key={c.id}
                    c={c}
                    e={e}
                    rendicionId={rendicionId}
                    archivo={archivoDe(c)}
                    enlace={enlaces[c.archivo_id ?? ""]}
                    catalogos={catalogos}
                    editable={editable}
                    intento={intento}
                    elegida={elegidas.has(c.id)}
                    onElegir={() => alternar(c.id)}
                    onGuardar={onGuardar}
                    onReleer={onReleer}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td colSpan={8} className="px-3 py-3 text-[13px] text-ink-3">
                    {cuenta.todos} comprobante{cuenta.todos === 1 ? "" : "s"}
                    {cuenta.descartados > 0 && ` · ${cuenta.descartados} descartado${cuenta.descartados === 1 ? "" : "s"} no suma${cuenta.descartados === 1 ? "" : "n"}`}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right font-bold tabular-nums">
                    {soles(total)}
                    {dolares > 0 && <span className="block text-xs font-normal text-ink-3">y US$ {dolares.toFixed(2)}</span>}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Teléfono: una tarjeta corta por comprobante; los datos se abren al tocarla. */}
          <ul className="space-y-2 md:hidden">
            {visibles.map(({ c, e }) => (
              <Tarjeta
                key={c.id}
                c={c}
                e={e}
                rendicionId={rendicionId}
                archivo={archivoDe(c)}
                enlace={enlaces[c.archivo_id ?? ""]}
                catalogos={catalogos}
                editable={editable}
                intento={intento}
                onGuardar={onGuardar}
                onReleer={onReleer}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

type PropsFila = {
  c: Comprobante;
  e: EstadoFila;
  rendicionId: string;
  archivo: Archivo | undefined;
  enlace: string | undefined;
  catalogos: Catalogos;
  editable: boolean;
  intento: number;
  onGuardar: (id: string, cambios: CambiosComprobante) => void;
  onReleer: (archivoId: string) => void;
};

/** Los campos de una fila, compartidos entre la tabla y la tarjeta del teléfono. */
function campos({ c, e, catalogos, editable, intento, onGuardar }: PropsFila) {
  const puede = editable && e.clave !== "descartado";
  const k = (campo: string, valor: unknown) => `${c.id}-${campo}-${String(valor)}-${intento}`;
  const num = (v: string) => (v ? Number(v) : null);
  // Lo que falta se marca, salvo mientras se lee: la lectura lo va a llenar.
  const marca = (vacio: boolean) => (vacio && e.clave !== "leyendo" && e.clave !== "descartado" ? celdaFalta : "");
  const tachado = e.clave === "descartado" ? "line-through" : "";

  return {
    fecha: (
      <input
        key={k("fecha", c.fecha)}
        type="date"
        aria-label="Fecha"
        className={`${celda} ${marca(!c.fecha)} ${tachado}`}
        defaultValue={c.fecha ?? ""}
        disabled={!puede}
        onBlur={(ev) => ev.target.value !== (c.fecha ?? "") && onGuardar(c.id, { fecha: ev.target.value || null })}
      />
    ),
    tipo: (
      <Lista
        valor={c.tipo_comprobante_id}
        etiqueta="Tipo de comprobante"
        opciones={catalogos.tipos.map((t) => ({ ...t, nombre: tipoCorto(t.id, t.nombre) }))}
        disabled={!puede}
        className={`${celda} font-semibold ${marca(!c.tipo_comprobante_id)}`}
        vacio="Tipo…"
        onGuardar={(v) => onGuardar(c.id, { tipo_comprobante_id: v || null })}
      />
    ),
    numero: (
      <Texto
        key={k("numero", numeroCompleto(c))}
        valor={numeroCompleto(c)}
        etiqueta="N° de comprobante"
        disabled={!puede}
        className={`${celdaChica} ${tachado} ${marca(!c.numero && c.tipo_comprobante_id !== "DJ")}`}
        placeholder={puede ? "N°" : undefined}
        onGuardar={(v) => onGuardar(c.id, partirNumero(v))}
      />
    ),
    proveedor: (
      <Texto key={k("proveedor", c.proveedor)} valor={c.proveedor} etiqueta="Proveedor" disabled={!puede} className={`${celda} ${tachado}`} onGuardar={(v) => onGuardar(c.id, { proveedor: v })} />
    ),
    ruc: (
      <Texto
        key={k("ruc", c.ruc)}
        valor={c.ruc}
        etiqueta="RUC"
        inputMode="numeric"
        disabled={!puede}
        className={celdaChica}
        placeholder={puede ? "RUC" : undefined}
        onGuardar={(v) => onGuardar(c.id, { ruc: v })}
      />
    ),
    proyecto: (
      <Lista
        valor={c.proyecto_id}
        etiqueta="Proyecto"
        opciones={catalogos.proyectos}
        disabled={!puede}
        className={`${celda} ${marca(c.proyecto_id == null)}`}
        vacio="Elegir…"
        onGuardar={(v) => onGuardar(c.id, { proyecto_id: num(v) })}
      />
    ),
    area: (
      <Lista valor={c.area_id} etiqueta="Área del solicitante" opciones={catalogos.areas} disabled={!puede} vacio="Área…" onGuardar={(v) => onGuardar(c.id, { area_id: num(v) })} />
    ),
    solicitante: (
      <Texto
        key={k("solicitante", c.solicitante)}
        valor={c.solicitante}
        etiqueta="Solicitante"
        disabled={!puede}
        className={celdaChica}
        placeholder={puede ? "Solicitante" : undefined}
        onGuardar={(v) => onGuardar(c.id, { solicitante: v })}
      />
    ),
    concepto: (
      <Lista
        valor={c.concepto_id}
        etiqueta="Concepto"
        opciones={catalogos.conceptos}
        disabled={!puede}
        className={`${celda} ${marca(c.concepto_id == null)}`}
        vacio="Concepto…"
        onGuardar={(v) => onGuardar(c.id, { concepto_id: num(v) })}
      />
    ),
    descripcion: (
      <Texto
        key={k("descripcion", c.descripcion)}
        valor={c.descripcion}
        etiqueta="Descripción"
        disabled={!puede}
        className={celdaChica}
        placeholder={puede ? "Motivo del gasto" : undefined}
        onGuardar={(v) => onGuardar(c.id, { descripcion: v })}
      />
    ),
    total: (
      <Texto
        key={k("total", c.total)}
        valor={c.total == null ? "" : aNumero(c.total).toFixed(2)}
        etiqueta="Total"
        inputMode="decimal"
        disabled={!puede}
        className={`${celda} text-right font-semibold tabular-nums ${tachado} ${marca(c.total == null)}`}
        onGuardar={(v) => onGuardar(c.id, { total: v === "" ? null : aNumero(v) })}
      />
    ),
  };
}

function Estado({ c, e, archivo, editable, onGuardar, onReleer }: PropsFila) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-[13px] font-bold ${TONOS[e.clave]}`} role={e.clave === "leyendo" ? "status" : undefined}>
        {e.texto}
      </span>
      {e.detalle && (
        <span className="line-clamp-2 text-xs text-ink-3" title={e.detalle}>
          {e.clave === "observado" ? `«${e.detalle}»` : e.detalle}
        </span>
      )}
      {editable && (
        <span className="flex gap-2 text-xs">
          {e.clave === "fallido" && archivo && (
            <button type="button" className="font-semibold text-primary-strong underline" onClick={() => onReleer(archivo.id)}>
              Reintentar
            </button>
          )}
          {e.clave !== "leyendo" && (
            <button type="button" className="text-ink-2 underline" onClick={() => onGuardar(c.id, { descartado: !c.descartado })}>
              {c.descartado ? "Recuperar" : "Descartar"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function Fila(p: PropsFila & { elegida: boolean; onElegir: () => void }) {
  const { c, e, rendicionId, archivo, enlace, editable, elegida, onElegir } = p;
  const f = campos(p);
  const fondo = elegida ? "bg-primary-soft/60" : e.clave === "descartado" ? "opacity-55" : e.porRevisar ? "bg-warning-soft/30" : "";
  return (
    <tr className={`border-t border-line align-middle ${fondo}`}>
      <td className="px-2 py-1.5">
        {editable && <input type="checkbox" aria-label="Elegir fila" checked={elegida} onChange={onElegir} />}
      </td>
      <td className="px-1 py-1.5">
        <Link href={`/rendicion/revisar/?id=${rendicionId}&c=${c.id}`} title="Revisar con la imagen" className="block w-fit">
          <Miniatura archivo={archivo} pagina={c.pagina} enlace={enlace} />
        </Link>
      </td>
      <td className="px-1 py-1.5">{f.fecha}</td>
      <td className="px-1 py-1.5">
        {f.tipo}
        {f.numero}
      </td>
      <td className="px-1 py-1.5">
        {f.proveedor}
        {f.ruc}
      </td>
      <td className="px-1 py-1.5">{f.proyecto}</td>
      <td className="px-1 py-1.5">
        {f.area}
        {f.solicitante}
      </td>
      <td className="px-1 py-1.5">
        {f.concepto}
        {f.descripcion}
      </td>
      <td className="px-1 py-1.5">{f.total}</td>
      <td className="px-2 py-1.5">
        <Estado {...p} />
      </td>
    </tr>
  );
}

function Tarjeta(p: PropsFila) {
  const { c, e, rendicionId, archivo, enlace } = p;
  const f = campos(p);
  const rotulo = "block text-[11px] font-bold uppercase tracking-wider text-ink-3";
  return (
    <li className={`rounded-card border border-line ${e.clave === "descartado" ? "opacity-55" : ""}`}>
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
          <Miniatura archivo={archivo} pagina={c.pagina} enlace={enlace} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{c.proveedor || (e.clave === "leyendo" ? "Leyendo…" : "Sin proveedor")}</span>
            <span className={`text-xs font-semibold ${TONOS[e.clave]}`}>
              {e.clave === "listo" ? `${tipoCorto(c.tipo_comprobante_id)} · ${numeroCompleto(c) || "s/n"}` : e.texto}
            </span>
          </span>
          <span className="font-bold tabular-nums">{c.total == null ? "—" : aNumero(c.total).toFixed(2)}</span>
        </summary>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line p-3">
          <label className={rotulo}>Fecha{f.fecha}</label>
          <label className={rotulo}>Total{f.total}</label>
          <label className={rotulo}>Tipo{f.tipo}</label>
          <label className={rotulo}>N°{f.numero}</label>
          <label className={`${rotulo} col-span-2`}>Proveedor{f.proveedor}</label>
          <label className={rotulo}>RUC{f.ruc}</label>
          <label className={rotulo}>Proyecto{f.proyecto}</label>
          <label className={rotulo}>Área{f.area}</label>
          <label className={rotulo}>Solicitante{f.solicitante}</label>
          <label className={`${rotulo} col-span-2`}>Concepto{f.concepto}</label>
          <label className={`${rotulo} col-span-2`}>Motivo{f.descripcion}</label>
          <div className="col-span-2 flex items-end justify-between gap-3">
            <Estado {...p} />
            <Link href={`/rendicion/revisar/?id=${rendicionId}&c=${c.id}`} className="text-sm font-semibold text-primary-strong underline">
              Ver imagen
            </Link>
          </div>
        </div>
      </details>
    </li>
  );
}

function AccionesEnBloque({
  cuantas,
  catalogos,
  onAplicar,
  onQuitar,
}: {
  cuantas: number;
  catalogos: Catalogos;
  onAplicar: (cambios: CambiosComprobante) => Promise<void>;
  onQuitar: () => void;
}) {
  const [area, setArea] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const control = "h-8.5 rounded-lg border border-primary-line/30 bg-surface px-2 text-[13px] text-primary-strong";
  return (
    <div role="toolbar" aria-label="Acciones sobre lo elegido" className="flex flex-wrap items-center gap-2 rounded-control bg-primary-soft px-3 py-2 text-sm text-primary-strong">
      <b className="mr-1">
        {cuantas} elegido{cuantas === 1 ? "" : "s"}
      </b>
      <select aria-label="Asignar proyecto" className={control} value="" onChange={(e) => e.target.value && onAplicar({ proyecto_id: Number(e.target.value) })}>
        <option value="">Asignar proyecto…</option>
        {catalogos.proyectos
          .filter((p) => p.activo)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
      </select>
      <select aria-label="Asignar concepto" className={control} value="" onChange={(e) => e.target.value && onAplicar({ concepto_id: Number(e.target.value) })}>
        <option value="">Asignar concepto…</option>
        {catalogos.conceptos
          .filter((c) => c.activo)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
      </select>
      <span className="flex flex-wrap items-center gap-1.5">
        <select aria-label="Área para lo elegido" className={control} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Área…</option>
          {catalogos.areas
            .filter((a) => a.activo)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
        </select>
        <input aria-label="Solicitante para lo elegido" placeholder="Solicitante" className={`${control} w-36`} value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
        <button
          type="button"
          disabled={!area && !solicitante.trim()}
          className={`${control} font-semibold disabled:bg-disabled disabled:text-disabled-ink`}
          onClick={async () => {
            await onAplicar({ ...(area ? { area_id: Number(area) } : {}), ...(solicitante.trim() ? { solicitante: solicitante.trim() } : {}) });
            setArea("");
            setSolicitante("");
          }}
        >
          Aplicar
        </button>
      </span>
      <button type="button" className={`${control} font-semibold`} onClick={() => onAplicar({ descartado: true })}>
        Descartar
      </button>
      <button type="button" className="ml-auto text-[13px] underline" onClick={onQuitar}>
        Quitar selección
      </button>
    </div>
  );
}
