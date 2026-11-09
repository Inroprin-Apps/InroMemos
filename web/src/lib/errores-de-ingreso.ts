/**
 * Lo que Google o Supabase dejan en la URL cuando el ingreso falla, en
 * palabras que la persona entienda.
 *
 * El caso que más importa: alguien entra con una cuenta que no es de
 * @inroprin.com. La base lo rechaza en el trigger alta_de_persona, y Supabase
 * lo devuelve como un genérico «Database error saving new user» que no dice
 * nada útil.
 */
export function mensajeDeIngreso(params: URLSearchParams): string | null {
  const descripcion = params.get("error_description") ?? "";
  const error = params.get("error") ?? "";
  if (!descripcion && !error) return null;

  if (/database error saving new user|inroprin\.com/i.test(descripcion)) {
    return "INROMEMOS es solo para cuentas de la empresa. Entra con tu correo @inroprin.com.";
  }
  if (error === "access_denied") {
    return "Se canceló el ingreso con Google. Puedes intentarlo de nuevo.";
  }
  return `No se pudo entrar: ${descripcion || error}.`;
}

/**
 * El error puede volver en la consulta (?error=…) o en el fragmento (#error=…)
 * según en qué paso falló. Se leen los dos.
 */
export function paramsDeRetorno(href: string): URLSearchParams {
  const url = new URL(href);
  const juntos = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.replace(/^#/, "")).forEach((v, k) => juntos.set(k, v));
  return juntos;
}
