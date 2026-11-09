# INROMEMOS

La app de INROPRIN (Roland Print) para **memorandums** de todas las empresas y
áreas, y **rendiciones** de caja chica y memos de viáticos. Se captura el comprobante (foto o PDF, desde el teléfono o la
PC), se lee solo, la persona revisa lo que falte y lo envía; administración lo
valida con la imagen al lado.

Publicado en <https://inroprin-apps.github.io/InroMemos/web/>. La raíz del sitio
redirige ahí.

> El contexto completo —decisiones con su razón, lo aprendido con documentos
> reales y lo que queda abierto— está en **[CONTEXTO.md](CONTEXTO.md)**. La
> plataforma de memos, la conexión con INROCONTA y lo que sigue, en
> **[PLAN.md](PLAN.md)**.

## Cómo está armado

| Parte | Qué hace |
|---|---|
| `web/` | La app: Next.js con exportación estática, en GitHub Pages bajo `/InroMemos/web/`. Instalable en el teléfono y usable sin señal. |
| `supabase/migrations/` | La base: tablas, permisos por fila, historial de cambios y catálogos. |
| `supabase/functions/leer/` | La lectura de cada foto o PDF, apenas se sube (Gemini; la clave es el secreto `GEMINI_API_KEY` de Supabase). |
| `supabase/functions/drive/` | La hoja y el PDF de cada rendición en Drive. |
| `supabase/functions/inroconta/` | La copia local de padrón de RUC, lista SSCO y registro de compras (SIRE) de INROCONTA (secretos `INROCONTA_URL` e `INROCONTA_TOKEN`). |
| `supabase/pruebas/` | Permisos por fila verificados contra un Postgres de verdad. |
| `procesador/` | Reglas de lectura en Python (OCR y apoyo de la hoja en Drive). |
| `sitio/` | La raíz del sitio publicado: solo redirige a la app. |

## Para trabajar

```bash
cd web && npm ci
npm run dev          # http://localhost:3000/InroMemos/web/
npm run lint && npm run typecheck && npm test

supabase/pruebas/correr.sh                       # permisos por fila (Postgres 16)
cd supabase/functions && deno test --no-lock     # la lectura
cd procesador && pip install -e ".[dev]" && pytest
```

Cada push a la rama de trabajo corre el CI (`.github/workflows/ci.yml`) y, si
pasa, publica (`.github/workflows/publicar.yml`).

## Seguridad

- El repositorio es público. **Nunca** van acá: la clave `service_role` de
  Supabase, la clave de Gemini, secretos de OAuth, tokens, ni los ejemplos
  históricos de gastos (llevan nombres de personas).
- La clave publicable de Supabase sí está en `web/src/lib/supabase.ts`: es
  pública por diseño; lo que protege los datos son los permisos por fila.
- Solo entran cuentas `@inroprin.com` (la base rechaza cualquier otra).
