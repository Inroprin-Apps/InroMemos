"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base";
import { estadoDrive, idDeCarpeta, irAConectar, terminarConexion, type EstadoDrive } from "@/lib/drive";
import { PaginaAdmin } from "../administracion";
import { Aviso, botonPrincipal, botonSecundario, campo } from "../piezas";

const rotulo = "block text-sm font-medium text-ink-2";

export function Drive() {
  return (
    <PaginaAdmin
      activo="drive"
      titulo="Drive"
      descripcion="Al enviar, cada versión deja su hoja y su PDF en la carpeta madre, con las imágenes; al aprobar, las imágenes se borran de INROMEMOS solo después de verificar la copia."
    >
      {() => <Contenido />}
    </PaginaAdmin>
  );
}

function Contenido() {
  const params = useSearchParams();
  const [estado, setEstado] = useState<EstadoDrive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [enlace, setEnlace] = useState("");
  const carpeta = idDeCarpeta(enlace);
  const hecho = useRef(false);

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    const code = params.get("code");
    const errorGoogle = params.get("error");
    // El código de Google sirve una sola vez: se saca de la dirección enseguida.
    if (code || errorGoogle) window.history.replaceState(null, "", `${BASE_PATH}/drive/`);
    const pedido = code
      ? terminarConexion(code, params.get("state") ?? "")
      : errorGoogle
        ? Promise.reject(new Error(errorGoogle === "access_denied" ? "Se canceló la conexión con Google." : `Google respondió: ${errorGoogle}`))
        : estadoDrive();
    pedido.then(setEstado, (e: Error) => {
      setError(e.message);
      estadoDrive().then(setEstado, () => {});
    });
  }, [params]);

  return (
    <section className="max-w-2xl space-y-4 rounded-card border border-control bg-surface p-5">
      {error && <Aviso>{error}</Aviso>}
      {!estado && !error && <p className="text-ink-3">Revisando la conexión…</p>}
      {estado?.conectado && (
        <Aviso tono="info">
          Conectado con <b>{estado.cuenta}</b> a la carpeta{" "}
          <a className="font-semibold underline" href={estado.enlace} target="_blank" rel="noreferrer">
            «{estado.carpeta}»
          </a>
          .
        </Aviso>
      )}
      {estado && !estado.conectado && (
        <p className="text-ink-2">Todavía no hay una cuenta conectada. Se conecta una vez, con una cuenta de administración.</p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
        <li>Abre en Drive la carpeta madre (puede estar dentro de una unidad compartida) y copia su enlace.</li>
        <li>Pégalo acá y conecta con una cuenta que pueda editar esa carpeta; acepta el acceso a Drive.</li>
        <li>Desde ahí, cada envío deja su carpeta, su hoja, su PDF y las imágenes.</li>
      </ol>
      <label className={rotulo}>
        Enlace de la carpeta madre
        <input
          className={`mt-1 ${campo}`}
          value={enlace}
          onChange={(e) => setEnlace(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
        />
      </label>
      {enlace && !carpeta && <p className="text-sm text-danger-strong">Ese enlace no parece de una carpeta de Drive.</p>}
      <button
        type="button"
        className={estado?.conectado ? botonSecundario : botonPrincipal}
        disabled={conectando || !carpeta}
        onClick={() => {
          if (!carpeta) return;
          setConectando(true);
          irAConectar(carpeta);
        }}
      >
        {estado?.conectado ? "Conectar de nuevo (otra cuenta o carpeta)" : "Conectar con Google Drive"}
      </button>
    </section>
  );
}
