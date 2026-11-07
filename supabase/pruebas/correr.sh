#!/usr/bin/env bash
# Aplica las migraciones sobre un Postgres vacío que imita a Supabase y corre
# las pruebas de permisos.
#
#   supabase/pruebas/correr.sh                 levanta un Postgres temporal
#   DATABASE_URL=postgres://… correr.sh        usa uno ya levantado y VACÍO (CI)
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
migraciones="$aqui/../migrations"

if [[ -z "${DATABASE_URL:-}" ]]; then
  bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  [[ -x "$bin/initdb" ]] || { echo "No encuentro initdb de PostgreSQL." >&2; exit 1; }

  tmp="$(mktemp -d)"
  # Postgres no arranca como root: si lo somos, corre como el usuario postgres.
  como=()
  if [[ "$(id -u)" == 0 ]]; then
    chown postgres "$tmp"
    como=(runuser -u postgres --)
  fi
  "${como[@]}" "$bin/initdb" -D "$tmp/datos" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
  "${como[@]}" "$bin/pg_ctl" -D "$tmp/datos" -l "$tmp/log" -w \
    -o "-k $tmp -p 54329 -c listen_addresses=''" start >/dev/null
  trap '"${como[@]}" "$bin/pg_ctl" -D "$tmp/datos" -m immediate stop >/dev/null; rm -rf "$tmp"' EXIT
  DATABASE_URL="postgresql://postgres@/postgres?host=$tmp&port=54329"
fi

correr() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$1"; }

correr "$aqui/entorno_local.sql"
for f in "$migraciones"/*.sql; do
  echo "migración $(basename "$f")"
  correr "$f"
done
correr "$aqui/permisos.sql"
correr "$aqui/memos.sql"
