-- InroScan · el reloj de la base y sus claves
--
-- Las claves que usan las funciones las genera la base, adentro: no pasan
-- por ninguna persona ni quedan en el repositorio.
--   integraciones «cuentas»: la clave de las huellas de cuentas bancarias.
--   integraciones «reloj»:   la huella del token con que el reloj llama a
--                             las funciones; el token vive en el Vault.
--
-- Tareas (hora de Lima = UTC-5):
--   cada 5 min   drive {pendientes}: envía la bandeja de correos y genera los PDF que falten
--   06:10        inroconta: padrón, SSCO y SIRE
--   06:20        drive {cuentas_sincronizar}: copia de las bases de cuentas
-- (Los recordatorios cada hora los programó …_memos_ciclo.)
--
-- Solo donde hay pg_net y Vault (Supabase); en el Postgres de las pruebas se salta.

insert into public.integraciones (clave, datos)
select 'cuentas', jsonb_build_object('clave',
         encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text)::bytea), 'hex'))
 where not exists (select 1 from public.integraciones where clave = 'cuentas');

do $$
declare
  token text;
  base text := 'https://vqabgnynidehfqueupki.supabase.co/functions/v1/';
  cabeceras text := $h$jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||
    (select decrypted_secret from vault.decrypted_secrets where name = 'reloj_token'))$h$;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault')
     or not exists (select 1 from pg_namespace where nspname = 'cron') then
    return;
  end if;
  create extension if not exists pg_net;

  if not exists (select 1 from vault.secrets where name = 'reloj_token') then
    token := encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex');
    perform vault.create_secret(token, 'reloj_token', 'Token del reloj de la base hacia las funciones de InroScan');
    insert into public.integraciones (clave, datos)
    values ('reloj', jsonb_build_object('huella', encode(sha256(token::bytea), 'hex')))
    on conflict (clave) do update set datos = excluded.datos, actualizado_en = now();
  end if;

  perform cron.schedule('memos-pendientes', '*/5 * * * *',
    format($c$select net.http_post(url := %L, headers := %s, body := '{"accion": "pendientes"}'::jsonb)$c$,
           base || 'drive', cabeceras));
  perform cron.schedule('inroconta-diario', '10 11 * * *',
    format($c$select net.http_post(url := %L, headers := %s, body := '{}'::jsonb, timeout_milliseconds := 300000)$c$,
           base || 'inroconta', cabeceras));
  perform cron.schedule('cuentas-diario', '20 11 * * *',
    format($c$select net.http_post(url := %L, headers := %s, body := '{"accion": "cuentas_sincronizar"}'::jsonb, timeout_milliseconds := 300000)$c$,
           base || 'drive', cabeceras));
end $$;
