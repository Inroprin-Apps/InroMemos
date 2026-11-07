-- Pruebas de la Plataforma de Memorandums: quién ve qué, cómo se numera, quién
-- aprueba, qué se puede cambiar en cada estado y el puente con rendiciones.
-- Corre después de permisos.sql (usa sus funciones pruebas.* y a carla@,
-- que es administración).
--
-- Personas:
--   jefa@   jefa de Finanzas de INROPRIN
--   emi@    emite en Finanzas
--   rita@   emite en RRHH
--   ines@   interárea: ve lo normal de todas las áreas
--   dora@   destinataria, sin área

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
set client_min_messages = notice;

\echo '\n· Memos: configuración de administración'

reset role;
insert into auth.users (email, raw_user_meta_data) values
  ('jefa@inroprin.com', '{"full_name": "Jefa Finanzas"}'),
  ('emi@inroprin.com',  '{"full_name": "Emi Emisor"}'),
  ('rita@inroprin.com', '{"full_name": "Rita RRHH"}'),
  ('ines@inroprin.com', '{"full_name": "Ines Interarea"}'),
  ('dora@inroprin.com', '{"full_name": "Dora Destino"}');

select id as emi from personas where correo = 'emi@inroprin.com' \gset
select id as rita from personas where correo = 'rita@inroprin.com' \gset
select id as inroprin from empresas where nombre = 'INROPRIN' \gset
select id as finanzas from unidades where codigo = 'FINANZAS' and empresa_id = :inroprin \gset
select id as rrhh from unidades where codigo = 'RRHH' and empresa_id = :inroprin \gset
select extract(year from now() at time zone 'America/Lima')::int as anio \gset
select id as concepto from conceptos order by id limit 1 \gset

select pruebas.ok((select count(*) from tipos_memo) = 53, 'los 53 tipos de memo de la hoja de configuración');
select pruebas.ok((select codigo = 'INR' from empresas where id = :inroprin), 'INROPRIN tiene su código corto');
select pruebas.ok((select count(*) from unidades where empresa_id = :inroprin) = 9, 'las 9 áreas emisoras de INROPRIN');

reset role; select pruebas.como('emi@inroprin.com');
update unidades set jefe_correo = 'emi@inroprin.com' where id = :finanzas;
select pruebas.ok((select jefe_correo is null from unidades where id = :finanzas),
  'nadie se nombra jefe a sí mismo');
select pruebas.falla($$insert into usuarios_memo (correo, ver_kpis) values ('emi@inroprin.com', true)$$,
  'ni se da permisos');

reset role; select pruebas.como('carla@inroprin.com');
update unidades set jefe_correo = 'jefa@inroprin.com' where id = :finanzas;
update unidades set requiere_aprobacion = false where id = :rrhh;
insert into usuarios_memo (correo) values ('jefa@inroprin.com'), ('emi@inroprin.com'), ('rita@inroprin.com');
insert into usuarios_memo (correo, interarea_todas) values ('ines@inroprin.com', true);
insert into miembros_unidad values ('emi@inroprin.com', :finanzas), ('rita@inroprin.com', :rrhh);
insert into correlativos (unidad_id, anio, ultimo) values (:finanzas, :anio, 28);
select pruebas.falla(format($$update correlativos set ultimo = 3 where unidad_id = %s$$, :finanzas),
  'el correlativo no retrocede');

\echo '\n· Memos: borrador y emisión'

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla(format($$insert into memos (unidad_id, tipo_codigo) values (%s, 'IN-COM')$$, :rrhh),
  'no se crean memos en un área ajena');

insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo, numero, estado)
values (:finanzas, 'PV-SER', 'Pago de servicio de mantenimiento', 'Me dirijo a usted…', ' DORA@inroprin.com ', 999, 'aprobado')
returning id as m1 \gset

select pruebas.ok((
  select estado = 'borrador' and numero is null and emisor_nombre = 'Emi Emisor'
         and destinatario_correo = 'dora@inroprin.com' and destinatario_nombre = 'Dora Destino'
         and requiere_pago and empresa_id = :inroprin
    from memos where id = :'m1'),
  'nace borrador, sin número, y lo demás sale solo, aunque se mande otra cosa');

select pruebas.falla(format($$update memos set estado = 'aprobado' where id = %L$$, :'m1'),
  'el estado no se cambia a mano');

select pruebas.ok((select count(*) > 0 from revisar_memo(:'m1') where mensaje like '%falta al menos una línea%'),
  'la revisión dice que un pago necesita líneas');
select pruebas.falla(format($$select emitir_memo(%L)$$, :'m1'), 'sin líneas no se envía');

insert into lineas_pago (memo_id, orden, empresa_pagadora_id, beneficiario_doc, beneficiario, concepto_id,
                         monto, tipo_comprobante, serie, numero, fecha_comprobante)
values (:'m1', 1, :inroprin, '20100047219', 'Proveedor SAC', :concepto, 1200, 'FT', 'F001', '599', (now() at time zone 'America/Lima')::date)
returning id as l1 \gset

select pruebas.ok((select count(*) > 0 from revisar_memo(:'m1') where mensaje like '%no es válido%'),
  'un RUC con el dígito verificador mal se detecta');
update lineas_pago set beneficiario_doc = '20100047218' where id = :'l1';
select pruebas.falla(format($$update lineas_pago set cuenta = '19112345678021' where id = %L$$, :'l1'),
  'la base no guarda una cuenta completa');
update lineas_pago set banco = 'BCP', cuenta = '••••8021' where id = :'l1';

select pruebas.ok((select count(*) = 0 from revisar_memo(:'m1') where nivel = 'error'), 'ya no le falta nada');
select emitir_memo(:'m1');
select pruebas.ok((
  select estado = 'pendiente' and numero = 29 and numero_visible = '029-' || :anio || '-FINANZAS'
         and id_tecnico = 'INR|029-' || :anio || '-FINANZAS' and version = 1 and total = 1200
    from memos where id = :'m1'),
  'se numera 029 (después de la semilla 028) y espera a la jefa');

update lineas_pago set monto = 1 where id = :'l1';
select pruebas.ok((select monto = 1200 from lineas_pago where id = :'l1'), 'enviado, sus líneas ya no se tocan');
select pruebas.falla(format($$select aprobar_memo(%L)$$, :'m1'), 'nadie aprueba su propio memo');

reset role; select pruebas.como('dora@inroprin.com');
select pruebas.ok((select count(*) from memos where id = :'m1') = 1, 'la destinataria ve el memo');
select pruebas.falla(format($$select dar_cargo(%L)$$, :'m1'), 'pero no da cargo antes de que se apruebe');

\echo '\n· Memos: observar, corregir, aprobar y cargo'

reset role; select pruebas.como('jefa@inroprin.com');
select pruebas.ok((select count(*) from memos where id = :'m1') = 1, 'la jefa ve lo de su área');
select pruebas.falla(format($$select observar_memo(%L, 'no')$$, :'m1'), 'observar exige decir qué');
select observar_memo(:'m1', 'Falta el acta de conformidad');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.ok((select estado = 'observado' and ultima_observacion = 'Falta el acta de conformidad' from memos where id = :'m1'),
  'vuelve observado con el comentario');
update lineas_pago set monto = 1180 where id = :'l1';
select pruebas.ok((select count(*) = 1 from memo_eventos where memo_id = :'m1' and tipo = 'linea_update'),
  'la corrección de una línea queda en la bitácora con su antes y después');
select emitir_memo(:'m1');
select pruebas.ok((select estado = 'pendiente' and numero = 29 and version = 2 and total = 1180 from memos where id = :'m1'),
  'corregido conserva su número y sube de versión');

reset role; select pruebas.como('jefa@inroprin.com');
select aprobar_memo(:'m1');
select pruebas.ok((select estado = 'aprobado' and codigo_sello ~ '^[0-9A-F]{4}-[0-9A-F]{4}$' from memos where id = :'m1'),
  'aprobado con su código de sello');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla(format($$select anular_memo(%L, 'me arrepentí')$$, :'m1'), 'quien emite ya no anula lo aprobado');

reset role; select pruebas.como('dora@inroprin.com');
select dar_cargo(:'m1', 5::smallint, 'Rápido');
select pruebas.ok((select estado = 'recibido' and valoracion = 5 and recibido_en is not null from memos where id = :'m1'),
  'la destinataria da el cargo con su valoración');
select pruebas.ok((select array_agg(tipo order by id) = '{creado,emitido,observado,linea_update,corregido,aprobado,recibido}'
                     from memo_eventos where memo_id = :'m1'),
  'la bitácora cuenta la historia completa, en orden');

\echo '\n· Memos: repetidos, numeración y anulación'

reset role; select pruebas.como('emi@inroprin.com');
insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:finanzas, 'PV-SER', 'Otra vez', 'Lo mismo', 'dora@inroprin.com') returning id as m2 \gset
insert into lineas_pago (memo_id, empresa_pagadora_id, beneficiario_doc, beneficiario, concepto_id,
                         monto, tipo_comprobante, serie, numero, fecha_comprobante)
values (:'m2', :inroprin, '20100047218', 'Proveedor SAC', :concepto, 1180, 'FT', 'F001', '00000599', (now() at time zone 'America/Lima')::date);
select pruebas.falla(format($$select emitir_memo(%L)$$, :'m2'),
  'el mismo comprobante (F001-599 = F001-00000599) no se pide dos veces');
select anular_memo(:'m2', 'Era un repetido');
select pruebas.ok((select estado = 'anulado' and numero is null from memos where id = :'m2'),
  'un borrador se descarta sin consumir número');

insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:finanzas, 'IN-COM', 'Comunicado', 'Texto', 'dora@inroprin.com') returning id as m3 \gset
select emitir_memo(:'m3');
select anular_memo(:'m3', 'Se envió por error');
insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:finanzas, 'IN-COM', 'Comunicado 2', 'Texto', 'dora@inroprin.com') returning id as m4 \gset
select emitir_memo(:'m4');
select pruebas.ok((select numero from memos where id = :'m3') = 30 and (select numero from memos where id = :'m4') = 31,
  'anulado conserva su número (030) y el siguiente es 031: nunca se reutiliza');

\echo '\n· Memos: visibilidad por área, interárea y confidencialidad'

reset role; select pruebas.como('rita@inroprin.com');
select pruebas.ok((select count(*) from memos where unidad_id = :finanzas) = 0, 'RRHH no ve los memos de Finanzas');

insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:rrhh, 'RH-HON', 'Honorarios de octubre', 'Pago de locadores', 'dora@inroprin.com') returning id as m5 \gset
insert into lineas_pago (memo_id, empresa_pagadora_id, beneficiario_doc, beneficiario, concepto_id, monto)
values (:'m5', :inroprin, '45678912', 'Persona Locadora', :concepto, 800);
select emitir_memo(:'m5');
select pruebas.ok((select estado = 'aprobado' and aprobado_por = :'rita' from memos where id = :'m5'),
  'en un área que no exige aprobación, se aprueba al emitir');

insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:rrhh, 'IN-COM', 'Aviso general', 'Texto', 'dora@inroprin.com') returning id as m6 \gset
select emitir_memo(:'m6');

reset role; select pruebas.como('ines@inroprin.com');
select pruebas.ok((select count(*) from memos where id = :'m6') = 1, 'interárea ve lo normal de otra área');
select pruebas.ok((select count(*) from memos where id = :'m5') = 0, 'pero no lo restringido (honorarios)');
select pruebas.ok((select count(*) from memos where estado = 'borrador') = 0, 'ni borradores ajenos');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.ok((select count(*) from memos where id in (:'m5', :'m6')) = 0, 'un emisor de Finanzas no ve RRHH');

reset role; select pruebas.como('carla@inroprin.com');
select pruebas.ok((select count(*) from memos) = 6, 'administración ve todo');

\echo '\n· Memos: lo que dice SUNAT (copia de INROCONTA)'

reset role;
insert into contribuyentes (ruc, razon_social, estado, condicion, ssco, ssco_resolucion) values
  ('20131312955', 'FANTASMA SAC', 'ACTIVO', 'HABIDO', true, 'RS 0123-2026'),
  ('20100047218', 'BANCO DE CREDITO DEL PERU', 'ACTIVO', 'HABIDO', false, null);
insert into sire_comprobantes (proveedor_ruc, tipo, serie, numero, periodo, total, moneda, en_concar)
values ('20100047218', '01', 'F001', '00000777', 202611, 500, 'PEN', true);

reset role; select pruebas.como_sistema();
select pruebas.falla($$select cargar_ssco('[]')$$, 'una lista SSCO vacía no desmarca a nadie');
select cargar_ssco('[{"ruc": "20131312955", "razon_social": "FANTASMA SAC", "ssco_resolucion": "RS 0123-2026", "ssco_desde": "2026-10-01"}]');
select pruebas.ok((select ssco and ssco_desde = '2026-10-01' from contribuyentes where ruc = '20131312955')
                  and (select not ssco from contribuyentes where ruc = '20100047218'),
  'la lista SSCO marca a los que están y deja a los demás');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla($$select cargar_ssco('[{"ruc": "20100047218"}]')$$, 'solo el sistema carga la lista SSCO');
select pruebas.ok((select count(*) from contribuyentes) = 2, 'el padrón (datos públicos de SUNAT) lo lee cualquiera con sesión');
select pruebas.ok((select count(*) from sire_comprobantes) = 0, 'el registro de compras, solo administración');
select pruebas.falla($$insert into contribuyentes (ruc) values ('20000000001')$$, 'y nadie escribe la copia desde la app');

insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:finanzas, 'PV-SER', 'Pago a proveedor dudoso', 'Texto', 'dora@inroprin.com') returning id as m8 \gset
insert into lineas_pago (memo_id, empresa_pagadora_id, beneficiario_doc, beneficiario, concepto_id,
                         monto, tipo_comprobante, serie, numero, fecha_comprobante)
values (:'m8', :inroprin, '20131312955', 'Fantasma', :concepto, 450, 'FT', 'F001', '1',
        (now() at time zone 'America/Lima')::date)
returning id as l8 \gset
select pruebas.falla(format($$select emitir_memo(%L)$$, :'m8'),
  'a un proveedor en la lista SSCO de SUNAT no se le paga');

update lineas_pago set beneficiario_doc = '20100047218', numero = '999' where id = :'l8';
select pruebas.ok((select count(*) = 1 from revisar_memo(:'m8') where nivel = 'aviso' and mensaje like '%no aparece en el registro de compras%'),
  'una factura que no está en el SIRE se avisa');
update lineas_pago set numero = '777' where id = :'l8';
select pruebas.ok((select count(*) = 1 from revisar_memo(:'m8') where mensaje like '%SUNAT registra la factura por PEN 500.00; el memo pide 450.00%'),
  'si el monto no coincide con SUNAT, se avisa');
select pruebas.ok((select count(*) = 1 from revisar_memo(:'m8') where mensaje like '%ya está registrada en CONCAR%'),
  'y si ya está en CONCAR, también');
select pruebas.ok((select count(*) = 0 from revisar_memo(:'m8') where nivel = 'error'), 'los avisos no impiden enviar');
select anular_memo(:'m8', 'Era una prueba');

\echo '\n· Memos: el puente con las rendiciones'

reset role; select pruebas.como('emi@inroprin.com');
insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto)
values ('memo', '029-2026-VIAJE', :inroprin, :'emi', 100) returning id as viaje \gset
insert into comprobantes (rendicion_id, client_id, total) values (:'viaje', gen_random_uuid(), 150);
update rendiciones set estado = 'enviada' where id = :'viaje';

reset role; select pruebas.como('carla@inroprin.com');
select pruebas.falla(format($$select memo_desde_rendicion(%L, %s::smallint)$$, :'viaje', :finanzas),
  'una rendición sin aprobar no pide su pago');
update rendiciones set estado = 'aprobada' where id = :'viaje';
select (memo_desde_rendicion(:'viaje', :finanzas::smallint)).id as m7 \gset
select pruebas.ok((
  select m.tipo_codigo = 'RR-VIA' and m.estado = 'borrador' and m.rendicion_id = :'viaje'
         and l.monto = 50 and l.beneficiario = 'Emi Emisor'
    from memos m join lineas_pago l on l.memo_id = m.id where m.id = :'m7'),
  'una rendición de viáticos aprobada arma su memo de reembolso por lo gastado de más (S/ 50)');
select pruebas.falla(format($$select memo_desde_rendicion(%L, %s::smallint)$$, :'viaje', :finanzas),
  'y no lo arma dos veces');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla(format($$select memo_desde_rendicion(%L, %s::smallint)$$, :'viaje', :finanzas),
  'el memo de una rendición lo arma administración');

reset role; select pruebas.como_anonimo();
select pruebas.falla($$select * from memos$$, 'sin sesión no se ve ningún memo');

reset role;
\echo '\nMemos en orden\n'
