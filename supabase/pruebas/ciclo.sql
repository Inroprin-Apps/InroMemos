-- Pruebas del ciclo completo del memo (migración …_memos_ciclo): DNI, memo de
-- entrega → rendición → memo de pago → pagado → rendición cerrada; roles de
-- Tesorería y verificador; avisos y recordatorios; cuentas; cola de InroPay;
-- KPIs. Corre después de memos.sql y usa a sus personas y memos.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
set client_min_messages = notice;

reset role;
select id as inroprin from empresas where nombre = 'INROPRIN' \gset
select id as finanzas from unidades where codigo = 'FINANZAS' and empresa_id = :inroprin \gset
select id as concepto from conceptos order by id limit 1 \gset
select id as emi from personas where correo = 'emi@inroprin.com' \gset
select id as dora from personas where correo = 'dora@inroprin.com' \gset

\echo '\n· Ciclo: el DNI propio'

reset role; select pruebas.como('dora@inroprin.com');
select pruebas.falla($$select guardar_mi_dni('123')$$, 'el DNI tiene 8 dígitos');
select guardar_mi_dni('45678913');
select pruebas.ok((select dni = '45678913' from personas where id = :'dora'), 'cada persona guarda su DNI');
reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla($$select guardar_mi_dni('45678913')$$, 'un DNI no se repite entre personas');
select guardar_mi_dni('45678914');

\echo '\n· Ciclo: entrega de viáticos → una rendición por persona'

insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:finanzas, 'RR-EVI', 'Viáticos de Dora y Zenón a Arequipa', 'Texto', 'jefa@inroprin.com') returning id as entrega \gset
insert into lineas_pago (memo_id, orden, empresa_pagadora_id, beneficiario_doc, beneficiario, concepto_id, monto, viaje_desde, viaje_hasta)
values (:'entrega', 1, :inroprin, '45678913', 'Dora Destino', :concepto, 600, '2026-11-03', '2026-11-08') returning id as linea_dora \gset
insert into lineas_pago (memo_id, orden, empresa_pagadora_id, beneficiario_doc, beneficiario, concepto_id, monto)
values (:'entrega', 2, :inroprin, '70000001', 'Zenón Campo', :concepto, 450) returning id as linea_zenon \gset
select pruebas.falla(format($$update lineas_pago set viaje_hasta = '2026-11-01' where id = %L$$, :'linea_dora'),
  'el viaje no termina antes de empezar');
select emitir_memo(:'entrega');
reset role; select pruebas.como('jefa@inroprin.com');
select aprobar_memo(:'entrega');

reset role; select pruebas.como('dora@inroprin.com');
select pruebas.ok((select count(*) = 1 and min(monto) = 600 and not bool_or(a_nombre_de_otro) from memos_para_rendir()),
  'Dora (tiene cuenta y DNI) ve solo su parte, S/ 600, para rendirla ella');
select pruebas.ok((select count(*) from memos where id = :'entrega') = 1 and (select count(*) from lineas_pago where memo_id = :'entrega') = 1,
  'quien recibe dinero por un memo lo ve, solo con su línea');
insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto, linea_entrega_id)
values ('memo', 'lo que sea', :inroprin, :'dora', 1, :'linea_dora') returning id as rinde \gset
select pruebas.ok((select numero_memo = (select numero_visible from memos where id = :'entrega') and monto = 600
                          and memo_entrega_id = :'entrega' and beneficiario = 'Dora Destino'
                     from rendiciones where id = :'rinde'),
  'la rendición toma del memo el número, lo recibido y a nombre de quién, aunque se mande otra cosa');
select pruebas.ok((select count(*) = 0 from memos_para_rendir()), 'y ya no aparece para rendir otra vez');
select pruebas.falla(format($$update rendiciones set linea_entrega_id = null where id = %L$$, :'rinde'),
  'lo que la rendición toma del memo no se cambia');
select pruebas.falla(format($$update rendiciones set monto = 1 where id = %L$$, :'rinde'),
  'ni lo recibido');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.ok((select count(*) = 1 and bool_and(a_nombre_de_otro) and min(beneficiario) = 'Zenón Campo' from memos_para_rendir()),
  'quien emitió la entrega ve para rendir solo a quien no tiene cuenta (Zenón), no a Dora');
select pruebas.falla(format($$insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto, linea_entrega_id)
  values ('memo', 'x', %s, %L, 1, %L)$$, :inroprin, :'emi', :'linea_dora'),
  'la jefatura no rinde por quien tiene cuenta');
insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto, linea_entrega_id)
values ('memo', 'x', :inroprin, :'emi', 1, :'linea_zenon') returning id as rinde_zenon \gset
select pruebas.ok((select monto = 450 and beneficiario = 'Zenón Campo' and beneficiario_doc = '70000001' and responsable_id = :'emi'
                     from rendiciones where id = :'rinde_zenon'),
  'y sí rinde a nombre de quien no tiene cuenta: dos rendiciones del mismo memo conviven');
select pruebas.falla(format($$insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto, memo_entrega_id)
  values ('memo', 'x', %s, %L, 1, %L)$$, :inroprin, :'emi', :'entrega'),
  'una rendición de la plataforma dice a nombre de quién (la línea)');

reset role; select pruebas.como('dario@inroprin.com');
select pruebas.falla(format($$insert into rendiciones (tipo, numero_memo, empresa_id, responsable_id, monto, linea_entrega_id)
  values ('memo', 'x', %s, %L, 1, %L)$$, :inroprin, (select id from personas where correo = 'dario@inroprin.com'), :'linea_zenon'),
  'nadie ajeno al memo rinde una entrega');

reset role; select pruebas.como_sistema();
select registrar_estado_pago(:'entrega', 'observado_analisis', 'Revisar la sede');
reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla(format($$update lineas_pago set monto = 1 where id = %L$$, :'linea_zenon'),
  'si Análisis devuelve el memo, la línea que ya se rinde no cambia de monto');
select pruebas.falla(format($$delete from lineas_pago where id = %L$$, :'linea_zenon'), 'ni se quita');
update lineas_pago set sede = 'Arequipa' where id = :'linea_zenon';
select pruebas.ok((select sede = 'Arequipa' from lineas_pago where id = :'linea_zenon'), 'pero lo demás sí se corrige');
reset role;
select pruebas.ok((select count(*) = 0 from rendiciones where memo_entrega_id is null and linea_entrega_id is null and beneficiario is not null),
  'las rendiciones escritas a mano no dicen a nombre de otro');

\echo '\n· Ciclo: Tesorería registra el pago y la rendición se cierra sola'

reset role; select pruebas.como('carla@inroprin.com');
select id as reembolso from memos where tipo_codigo = 'RR-VIA' and rendicion_id is not null \gset
select id as viaje from rendiciones where numero_memo = '029-2026-VIAJE' \gset
update lineas_pago set beneficiario_doc = '45678914', concepto_id = :concepto where memo_id = :'reembolso';
update memos set destinatario_correo = 'jefa@inroprin.com' where id = :'reembolso';
select emitir_memo(:'reembolso');
reset role; select pruebas.como('jefa@inroprin.com');
select aprobar_memo(:'reembolso');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla(format($$select registrar_estado_pago(%L, 'pagado')$$, :'reembolso'), 'quien no es Tesorería no registra pagos');

reset role; select pruebas.como('carla@inroprin.com');
insert into usuarios_memo (correo, registra_pagos) values ('dario@inroprin.com', true);

reset role; select pruebas.como('dario@inroprin.com');
select pruebas.ok((select count(*) from memos where id = :'reembolso') = 1, 'Tesorería ve los memos de pago aprobados de cualquier área');
select pruebas.ok((select count(*) from lineas_pago where memo_id = :'reembolso') = 1, 'y sus líneas');
select pruebas.ok((select count(*) from memos where estado = 'borrador') = 0, 'pero no borradores');
select registrar_estado_pago(:'reembolso', 'en_analisis');
select registrar_estado_pago(:'reembolso', 'pagado', 'Transferencia BCP');
reset role;
select pruebas.ok((select estado = 'liquidada' from rendiciones where id = :'viaje'),
  'pagado el memo, la rendición de la que salió queda liquidada sola');
select pruebas.ok((select count(*) = 2 from memo_eventos where memo_id = :'reembolso' and tipo = 'pago'),
  'cada cambio de pago queda una vez en la bitácora');

\echo '\n· Ciclo: Análisis y Registro observa'

reset role; select pruebas.como('emi@inroprin.com');
insert into memos (unidad_id, tipo_codigo, asunto, cuerpo, destinatario_correo)
values (:finanzas, 'RR-VIA', 'Viáticos 2', 'Texto', 'jefa@inroprin.com') returning id as v2 \gset
insert into lineas_pago (memo_id, empresa_pagadora_id, beneficiario_doc, beneficiario, concepto_id, monto)
values (:'v2', :inroprin, '45678913', 'Dora Destino', :concepto, 100);
select emitir_memo(:'v2');
reset role; select pruebas.como('jefa@inroprin.com');
select aprobar_memo(:'v2');
reset role; select pruebas.como_sistema();
select pruebas.ok((select count(*) >= 1 from cola_inropay where memo_id = :'v2'), 'el memo aprobado entra a la cola de InroPay');
select pruebas.falla(format($$select registrar_estado_pago(%L, 'observado_analisis', '')$$, :'v2'), 'observar en análisis exige decir qué');
select registrar_estado_pago(:'v2', 'observado_analisis', 'Falta el anexo de gastos');
select pruebas.ok((select estado = 'observado' and ultima_observacion like 'Análisis y Registro:%' from memos where id = :'v2'),
  'el memo vuelve a quien lo emitió con la observación');
select pruebas.ok((select count(*) = 0 from cola_inropay where memo_id = :'v2'), 'y sale de la cola mientras se corrige');
reset role; select pruebas.como('emi@inroprin.com');
select emitir_memo(:'v2');
select pruebas.ok((select estado = 'pendiente' and estado_pago is null from memos where id = :'v2'),
  'corregido vuelve a aprobación y a la cola limpio');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla($$select * from cola_inropay$$, 'nadie con sesión lee la cola de InroPay: solo el sistema');

\echo '\n· Ciclo: avisos y recordatorios'

reset role;
select pruebas.ok((select count(*) >= 1 from avisos a join memos m on m.id = a.memo_id
                    where a.tipo = 'por_aprobar' and a.para = '{jefa@inroprin.com}'),
  'al emitir, la jefa tiene un aviso por aprobar');
select pruebas.ok((select count(*) >= 1 from avisos where tipo = 'aprobado' and para = '{dora@inroprin.com}'),
  'al aprobar, la destinataria tiene el memo');
select pruebas.ok((select count(*) >= 1 from avisos where tipo = 'observado' and para = '{emi@inroprin.com}'),
  'al observar, el emisor tiene el aviso');
select pruebas.ok((select count(*) >= 1 from avisos where tipo = 'recibido'), 'al dar cargo, el emisor se entera');

alter table memos disable trigger memo_al_guardar;
update memos set actualizado_en = now() - interval '5 hours' where id = :'v2';
alter table memos enable trigger memo_al_guardar;
delete from avisos where memo_id = :'v2';
select pruebas.ok(encolar_recordatorios('2026-11-10 15:00:00+00') >= 1, 'un martes a las 10:00 se recuerda lo que espera aprobación');
select pruebas.ok((select fuera_de_meta and copia = '{emi@inroprin.com}' from avisos where memo_id = :'v2' and tipo = 'recordatorio_aprobar'),
  'pasada la meta de 3 horas, con copia al emisor');
select encolar_recordatorios('2026-11-10 15:30:00+00');
select pruebas.ok((select count(*) = 1 from avisos where memo_id = :'v2' and tipo = 'recordatorio_aprobar'), 'una sola vez por hora');
select pruebas.ok(encolar_recordatorios('2026-11-08 15:00:00+00') = 0, 'ni en domingo');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.ok((select count(*) from avisos) = 0, 'la bandeja de correos solo la ve administración');

\echo '\n· Ciclo: cuentas bancarias'

reset role; select pruebas.como_sistema();
insert into cuentas_bancarias (base, identificador, titular, banco, cuenta, huella_cuenta, estado, motivo)
values ('PLATAFORMA', '20100047218', 'Proveedor SAC', 'BCP', '••••9999', repeat('a', 64), 'pendiente', 'alta')
returning id as cuenta \gset
select pruebas.falla($$insert into cuentas_bancarias (base, identificador, cuenta) values ('NACIONAL', '1', '19112345678021')$$,
  'ni siquiera el sistema guarda una cuenta completa');
select m1 from (select id as m1 from memos where asunto = 'Pago de servicio de mantenimiento') x \gset
update lineas_pago set huella_cuenta = repeat('a', 64), estado_cuenta = 'pendiente' where memo_id = :'m1';

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.ok((select count(*) from cuentas_bancarias) = 0, 'las cuentas registradas las ve quien verifica');
select pruebas.falla(format($$select decidir_cuenta(%L, true)$$, :'cuenta'), 'y solo él decide');

reset role; select pruebas.como('carla@inroprin.com');
insert into usuarios_memo (correo, verifica_cuentas) values ('ana@inroprin.com', true);
reset role; select pruebas.como('ana@inroprin.com');
select decidir_cuenta(:'cuenta', false);
select pruebas.ok((select estado = 'rechazada' from cuentas_bancarias where id = :'cuenta'), 'el verificador rechaza la cuenta');
reset role;
select pruebas.ok((select estado_cuenta = 'rechazada' from lineas_pago where memo_id = :'m1'), 'y la línea con esa cuenta queda rechazada');
select pruebas.ok((select count(*) = 1 from revisar_cuentas(:'m1') where nivel = 'error'), 'una cuenta rechazada no se paga');

\echo '\n· Ciclo: sustentos y KPIs'

reset role; select pruebas.como('rita@inroprin.com');
select pruebas.ok((select count(*) from memo_sustentos where memo_id = :'m1') = 0, 'RRHH no ve los sustentos de Finanzas');
reset role; select pruebas.como('jefa@inroprin.com');
select pruebas.ok((select count(*) from memo_sustentos where memo_id = :'m1') = 2, 'la jefa de Finanzas sí');
select pruebas.falla(format($$insert into memo_sustentos (memo_id, nombre, ruta, tipo_mime, tamano) values (%L, 'x.pdf', %L, 'application/pdf', 1)$$,
  :'m1', :'m1' || '/x.pdf'), 'a un memo enviado no se le agregan sustentos');

reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla($$select kpis_memos('2026-01-01', '2026-12-31')$$, 'sin «Ver KPIs» no hay indicadores');
reset role; select pruebas.como('carla@inroprin.com');
select pruebas.ok((select (kpis_memos('2020-01-01', '2100-12-31') ->> 'emitidos')::int >= 5), 'administración ve los indicadores');
update usuarios_memo set ver_kpis = true where correo = 'emi@inroprin.com';
reset role; select pruebas.como('emi@inroprin.com');
select pruebas.ok((select kpis_memos('2020-01-01', '2100-12-31') ? 'a_la_primera_pct'), 'y quien tiene el permiso, también');

\echo '\n· KPIs para jefaturas y valoración de cada acción'

reset role;
update usuarios_memo set ver_kpis = false where correo = 'emi@inroprin.com';
reset role; select pruebas.como('emi@inroprin.com');
select pruebas.falla($$insert into valoraciones (accion, puntaje) values ('emitir', 6)$$, 'la valoración va de 1 a 5');
insert into valoraciones (accion, puntaje, comentario, memo_id) values ('emitir', 2, '  Tardó en cargar  ', :'v2');
insert into valoraciones (accion, puntaje, comentario, memo_id) values ('emitir', 4, 'Mejor', :'v2');
select pruebas.ok((select count(*) = 1 and min(puntaje) = 4 from valoraciones where memo_id = :'v2'),
  'valorar otra vez la misma acción reemplaza la anterior');
select pruebas.ok((select unidad_id = :finanzas from valoraciones where memo_id = :'v2'), 'la valoración queda en el área del memo');
insert into valoraciones (persona_id, accion, puntaje) values (:'dora', 'otro', 5);
select pruebas.ok((select persona_id = :'emi' from valoraciones where accion = 'otro'),
  'nadie valora a nombre de otro: queda como de quien la escribió');
select pruebas.falla($$select kpis_memos('2020-01-01', '2100-12-31')$$, 'quien solo emite no ve los KPIs');

reset role; select pruebas.como('rita@inroprin.com');
select pruebas.ok((select count(*) = 0 from valoraciones), 'cada quien ve solo sus valoraciones');

reset role; select pruebas.como('jefa@inroprin.com');
select pruebas.ok((select kpis_memos('2020-01-01', '2100-12-31') ->> 'alcance' = 'Finanzas'), 'la jefa de Finanzas ve los KPIs de su área');
select pruebas.ok((select (k ->> 'acogida_n')::int = 1 and (k ->> 'acogida')::numeric = 4 and jsonb_array_length(k -> 'comentarios') = 1
                     from kpis_memos('2020-01-01', '2100-12-31') k),
  'con la acogida de su área y sus comentarios');
select pruebas.ok((select (kpis_memos('2020-01-01', '2100-12-31') ->> 'emitidos')::int
                   = (select count(*) from memos where unidad_id = :finanzas and emitido_en is not null)),
  'solo cuenta los memos de su área');
select pruebas.falla($$insert into auditorias (auditor, nivel, resumen) values ('yo', 'ok', 'todo bien')$$,
  'la auditoría externa no la escribe nadie con sesión');

reset role;
insert into auditorias (auditor, nivel, resumen, hallazgos) values ('Agente externo', 'observaciones', 'Dos memos sin PDF', '[{"x":1},{"x":2}]');
select pruebas.como('carla@inroprin.com');
select pruebas.ok((select k -> 'auditoria' ->> 'nivel' = 'observaciones' and (k -> 'auditoria' ->> 'hallazgos')::int = 2
                     from kpis_memos('2020-01-01', '2100-12-31') k), 'el último informe de la auditoría externa aparece en los KPIs');

reset role;
\echo '\nCiclo en orden\n'
