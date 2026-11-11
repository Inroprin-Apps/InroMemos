-- Proyectos propuestos (11-nov-2026). Quien rinde y no encuentra su proyecto
-- en la lista ya no se queda trabado esperando a administración: lo propone
-- desde la misma hoja y sigue. El proyecto nace «por confirmar»: se puede usar
-- en rendiciones, y administración lo confirma, lo corrige o lo desactiva en
-- Catálogos. Los memos solo ofrecen proyectos confirmados (su lista va al
-- registro de gastos).

alter table public.proyectos
  add column confirmado boolean not null default true,
  add column propuesto_por uuid references public.personas (id);

-- Devuelve el proyecto con ese nombre; si no existe, lo crea por confirmar.
-- «paq 02  china civil» y «PAQ 02 CHINA CIVIL» son el mismo.
create function public.proponer_proyecto(nombre text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  limpio text := upper(regexp_replace(btrim(coalesce(nombre, '')), '\s+', ' ', 'g'));
  p public.proyectos;
begin
  if auth.uid() is null or not public.persona_activa() then
    raise exception 'Tu cuenta no está habilitada.';
  end if;
  if length(limpio) < 3 or length(limpio) > 80 then
    raise exception 'Escribe el nombre del proyecto (entre 3 y 80 letras).';
  end if;

  select * into p from public.proyectos x where upper(x.nombre) = limpio;
  if found then
    if not p.activo then
      raise exception 'Ese proyecto está desactivado. Pídeselo a administración.';
    end if;
    return p.id;
  end if;

  -- Sin abuso: cada persona, a lo más cinco esperando confirmación.
  if not public.es_admin()
     and (select count(*) from public.proyectos x where x.propuesto_por = auth.uid() and not x.confirmado and x.activo) >= 5 then
    raise exception 'Ya propusiste 5 proyectos que administración todavía no confirma. Avísales para seguir.';
  end if;

  insert into public.proyectos (nombre, confirmado, propuesto_por)
  values (limpio, public.es_admin(), auth.uid())
  returning * into p;
  return p.id;
end $$;

revoke all on function public.proponer_proyecto(text) from public, anon, authenticated;
grant execute on function public.proponer_proyecto(text) to authenticated;
