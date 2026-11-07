/**
 * Errores de la base en palabras de la persona.
 *
 * Las reglas viven en Postgres (supabase/migrations): el memo repetido, el
 * RUC mal formado, la rendición ya enviada. La app no las duplica; solo
 * traduce el error cuando una salta.
 */

type ErrorDeBase = { code?: string; message?: string; details?: string | null } | null | undefined;

export function mensajeDeBase(e: ErrorDeBase): string {
  if (!e) return "Algo salió mal.";
  const texto = `${e.message ?? ""} ${e.details ?? ""}`;

  if (/failed to fetch|networkerror|load failed/i.test(texto)) {
    return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  }
  switch (e.code) {
    case "23505":
      if (texto.includes("rendiciones_memo_unico")) {
        return "Ese número de memo ya está registrado. Si es tuyo, está en tu lista; si no, avísale a administración.";
      }
      if (texto.includes("una_reposicion_en_curso")) {
        return "Esta caja ya tiene una reposición en curso: ciérrala antes de abrir otra.";
      }
      if (texto.includes("cajas_numero_key")) return "Ya existe una caja con ese número.";
      if (texto.includes("archivos_rendicion_id_huella_key")) {
        return "Ese archivo ya está subido en esta rendición.";
      }
      return "Eso ya está registrado.";
    case "23514":
      if (texto.includes("ruc")) return "El RUC tiene 11 dígitos y empieza en 10, 15, 17 o 20.";
      if (texto.includes("monto")) return "El monto no puede ser negativo.";
      return "Hay un dato fuera de lo permitido.";
    case "22P02":
    case "22007":
    case "22008":
      return "Hay un dato con un formato que no se reconoce (una fecha o un importe).";
    case "42501":
      return "No tienes permiso para hacer eso.";
    // Una actualización que los permisos dejaron en cero filas.
    case "PGRST116":
      return "Ya no se puede editar: cambió de estado. Recarga la página.";
    // Los triggers ya escriben su motivo en castellano.
    case "P0001":
      return e.message ?? "La base rechazó el cambio.";
  }
  return e.message || "Algo salió mal.";
}

export class FallaDeBase extends Error {
  constructor(e: ErrorDeBase) {
    super(mensajeDeBase(e));
    this.name = "FallaDeBase";
  }
}
