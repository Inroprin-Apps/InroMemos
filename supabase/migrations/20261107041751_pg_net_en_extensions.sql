-- pg_net quedó en «public» (lo marcó el asesor de seguridad de Supabase):
-- va al esquema «extensions». Sus funciones siguen en «net», así que las
-- tareas del reloj no cambian.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
