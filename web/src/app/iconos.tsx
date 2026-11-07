/** Íconos de trazo, del mismo juego que el diseño aprobado. Decorativos: el texto va al lado. */

type Props = { className?: string };

function Trazo({ className = "h-5 w-5", children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconoInicio = (p: Props) => (
  <Trazo {...p}>
    <path d="M3 10.5L12 3l9 7.5V21H3z" />
    <path d="M9 21v-6h6v6" />
  </Trazo>
);
export const IconoBandeja = (p: Props) => (
  <Trazo {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5h13L22 12v7H2v-7z" />
  </Trazo>
);
export const IconoCaja = (p: Props) => (
  <Trazo {...p}>
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <path d="M16 13h2M2 10h20M6 6V4h12v2" />
  </Trazo>
);
export const IconoLista = (p: Props) => (
  <Trazo {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Trazo>
);
export const IconoPersonas = (p: Props) => (
  <Trazo {...p}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6" />
  </Trazo>
);
export const IconoReportes = (p: Props) => (
  <Trazo {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </Trazo>
);
export const IconoMas = (p: Props) => (
  <Trazo {...p}>
    <path d="M12 5v14M5 12h14" />
  </Trazo>
);
export const IconoSalir = (p: Props) => (
  <Trazo {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Trazo>
);
export const IconoIzquierda = (p: Props) => (
  <Trazo {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Trazo>
);
export const IconoDerecha = (p: Props) => (
  <Trazo {...p}>
    <path d="M9 18l6-6-6-6" />
  </Trazo>
);
export const IconoSubir = (p: Props) => (
  <Trazo {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Trazo>
);
export const IconoBajar = (p: Props) => (
  <Trazo {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </Trazo>
);
export const IconoReloj = (p: Props) => (
  <Trazo {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Trazo>
);
export const IconoCamara = (p: Props) => (
  <Trazo {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="4" />
  </Trazo>
);
export const IconoBuscar = (p: Props) => (
  <Trazo {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Trazo>
);
export const IconoCheck = (p: Props) => (
  <Trazo {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Trazo>
);
export const IconoSinSenal = (p: Props) => (
  <Trazo {...p}>
    <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18" />
  </Trazo>
);
export const IconoCerrar = (p: Props) => (
  <Trazo {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Trazo>
);
export const IconoGirar = (p: Props) => (
  <Trazo {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Trazo>
);
export const IconoNube = (p: Props) => (
  <Trazo {...p}>
    <path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z" />
  </Trazo>
);
export const IconoMemo = (p: Props) => (
  <Trazo {...p}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  </Trazo>
);
export const IconoAprobar = (p: Props) => (
  <Trazo {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.5 2.5L16 9.5" />
  </Trazo>
);
export const IconoEnviar = (p: Props) => (
  <Trazo {...p}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
  </Trazo>
);
export const IconoAjustes = (p: Props) => (
  <Trazo {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Trazo>
);
export const IconoSobre = (p: Props) => (
  <Trazo {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
  </Trazo>
);
