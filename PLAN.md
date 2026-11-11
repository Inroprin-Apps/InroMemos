# Plan: INROMEMOS como la app de INROPRIN para memos y rendiciones

> **Nombre:** desde el 9-nov-2026 la app se llama **INROMEMOS** (antes InroScan): repositorio
> `Inroprin-Apps/InroMemos`, en <https://inroprin-apps.github.io/InroMemos/web/>. La dirección vieja
> `…/InroScan/web/` dejó de existir (GitHub no la redirige). Por dentro, tablas, funciones y claves del
> navegador conservan `inroscan`; el proyecto de Google Cloud sigue siendo `inroscan-contabilidad`.
>
> Decisiones del 7-nov-2026: cómo la **Plataforma de Memorandums** (diseñada en
> Apps Script por Finanzas, traspaso del 3-nov-2026) entra en INROMEMOS, cómo se
> conecta con **INROCONTA** (Contabilidad) y qué sigue. Lo que ya estaba en
> INROMEMOS sigue en [CONTEXTO.md](CONTEXTO.md).

---

## 1. La idea: una súper app hecha de sistemas que se hablan

No es un monolito. Cada sistema es **dueño de su tema** y los demás lo leen
por un contrato:

| Sistema | Es dueño de | Cómo lo leen los demás |
|---|---|---|
| **INROMEMOS** (este repo) | Memos de todas las empresas y áreas; rendiciones de caja chica y viáticos | Su base Supabase, con permisos por fila. A futuro, la cola de pagos hacia InroPay (§5) |
| **INROCONTA** (`Inroprin-Apps/Inroconta`) | Lo que viene de SUNAT: padrón de RUC, lista SSCO, registro de compras (SIRE), XML/PDF, OC, centros de costo, detracciones, CONCAR | `/api/apps/<app>/datos/<padron\|ssco\|sire\|concar>` con un token por app |
| **InroPay** (Apps Script) | Análisis y Registro → RG → Programación y Pagos | Los 17 campos de `MAPEO_RG` (pendiente, §5) |
| **Bases de cuentas** (3 Google Sheets) | Cuentas bancarias de proveedores, importaciones y personal | Lectura por encabezado (pendiente, §5) |

Lo que comparten todos: **cuentas @inroprin.com con Google**, el **sistema
visual INROCONTA** (Manrope, colores por rol de la marca Roland Print) y la
regla de que **el servidor decide; la pantalla solo muestra**.

---

## 2. Decisiones (y por qué)

| Tema | Decisión | Por qué |
|---|---|---|
| Vercel | **No hace falta** | INROMEMOS ya tiene su servidor en Supabase (base, permisos por fila, funciones, reloj). Vercel solo serviría para páginas armadas en un servidor, que esta app no necesita: es estática en GitHub Pages y funciona sin señal. Un sistema menos que mantener. |
| Apps Script → INROMEMOS | La plataforma de memos **se construye en INROMEMOS**, no en Apps Script | El código de Apps Script nunca corrió en Google real y no vino en el traspaso (solo documentos, vistas y la hoja de configuración). Postgres hace mejor lo que Apps Script resolvía con candados y hojas: la numeración (una transacción con candado de fila: dos emisiones a la vez nunca reciben el mismo número), los estados (funciones y triggers), la visibilidad por área (permisos por fila) y el historial. Y se comparte con las rendiciones: mismas personas, empresas, proyectos y conceptos. |
| Diseño | **INROCONTA** para toda la app | Es el sistema visual vigente del grupo. Del prototipo aprobado de memos se conserva la estructura (panel, emitir, detalle, papel, bitácora), pintada con los roles de INROCONTA. |
| INROCONTA | **Copia local** de padrón, SSCO y SIRE en la base de INROMEMOS | Cada revisión de un memo consulta la propia base, al instante, aunque INROCONTA no responda en ese momento. La función `inroconta` la refresca a mano o una vez al día. La base v2 de INROCONTA está en otro proyecto de Supabase y es solo de servidor: la puerta correcta es su API para apps. |
| Hoja de configuración | Sus catálogos pasan a la base | Empresas (20, con código corto), áreas emisoras, los **53 tipos de memo** y sus sustentos están en la migración `…_memos_catalogos.sql`. Jefes, personas, carpetas y semillas **no** van al repositorio (es público): los carga administración en «Áreas y permisos de memos». |

### De INROCONTA se tomó, además del diseño

- **Pedir menos:** el panel trae los memos sin su cuerpo, por páginas de 1000 (lo máximo que entrega Supabase).
- **«Quién soy» una vez por consulta:** la política de memos calcula las áreas de la persona una vez y no memo por memo (lo que dejó sin responder a la base vieja de INROCONTA).
- **Filtros en la dirección:** compartir el enlace del panel muestra lo mismo.
- **Huecos de carga del tamaño del valor**, sin pantallas de «cargando».
- **Corridas:** cada vez que una función del sistema trabaja deja su fila (`corridas`), para la salud del sistema.
- **Uno detrás de otro:** la copia de INROCONTA trae padrón, SSCO y SIRE en fila, no a la vez.

---

## 3. Lo que ya está hecho (rama `claude/practical-planck-hdvk36`)

**Base** (`supabase/migrations/2026110700000*`), con sus pruebas en `supabase/pruebas/memos.sql`:

- Unidades emisoras (empresa + área), personas por correo, interárea, KPIs.
- Memos con serie **empresa + área + año** (`029-2026-FINANZAS`, técnico `INR|029-2026-FINANZAS`), que nunca se repite ni retrocede; anulado conserva su número.
- Estados: borrador → pendiente → aprobado → (enviado) → recibido; observado vuelve con el mismo número y versión +1; anulado es final. Solo cambian por `emitir_memo`, `aprobar_memo`, `observar_memo`, `anular_memo` y `dar_cargo`.
- Aprobación: jefe o suplente del área, nunca el propio emisor; si el área no exige aprobación, o emite el jefe un memo **sin pago**, se aprueba al emitir. Un memo **con pago** siempre lo aprueba otra persona (el suplente, el jefe o, si no hay, administración). Un memo con una cuenta nueva o distinta no pasa a InroPay hasta que quien verifica cuentas la apruebe; si la rechaza, vuelve al emisor como observado. Sello con código (`7F3A-91C2`).
- Visibilidad: cada área lo suyo; restringido sin interárea; confidencial (planilla) solo participantes, jefe y administración.
- Líneas de pago (los 17 campos de InroPay): RUC con dígito verificador, comprobante normalizado, duplicados contra todos los memos, **la cuenta solo enmascarada** (la base rechaza una completa), agrupar desde 15 personas, monedas.
- `revisar_memo()`: todo lo que falta, en palabras, antes de enviar.
- **Cruces con INROCONTA:** proveedor en la lista **SSCO** → no se envía; no habido o de baja → aviso; factura que **no está en el SIRE**, con **monto distinto** o **ya en CONCAR** → aviso.
- **El puente con las rendiciones:** `memo_desde_rendicion()` convierte una rendición aprobada en su memo de pago ya armado (caja chica → `RR-CCH` reposición; viáticos → `RR-VIA` reembolso de lo gastado de más).

**Viáticos en dos momentos** (migración `…_viaticos_entrega.sql`, 7-nov-2026), como los memos de Word de hoy:

- **Antes del viaje:** la jefatura emite «Entrega de viáticos (a rendir)» (`RR-EVI`), una línea por persona con las fechas del viaje. Aprueba el jefe del área (lógica de Franco) y entra a la cola de pagos.
- **Después:** una rendición **por persona**. La hace quien recibió el dinero si tiene cuenta @inroprin.com (se le reconoce por su DNI); si no tiene cuenta (personal de campo), la hace la jefatura que emitió el memo, **a nombre de esa persona**.
- **Si gastó de más:** «Reembolso de viáticos» (`RR-VIA`) paga a la persona que viajó, no a quien rindió. Si gastó de menos, devuelve la diferencia.
- Una línea que ya se está rindiendo no cambia de persona, monto ni empresa, aunque Análisis devuelva el memo.

**App** (`web/src/app/memos/`): Panel de memos, Emitir memo, el memo (editor con vista previa del papel y detalle con aprobar / observar / dar cargo / anular, y bitácora), Áreas y permisos de memos (con la tarjeta Datos de INROCONTA), y el botón «Pedir el pago con un memo» en cada rendición aprobada.

**Función** `supabase/functions/inroconta/`: trae padrón, SSCO y SIRE de INROCONTA, con sus pruebas.

---

## 4. Ya en producción (7-nov-2026)

- **Base:** las migraciones de memos, catálogos, INROCONTA, ciclo completo y reloj están aplicadas en Supabase.
- **Funciones:** `drive` (PDF y legajo del memo, bandeja de correos, cuentas), `ia` (redacción y lectura de sustentos), `inroconta` e `inropay`, desplegadas.
- **Reloj (pg_cron):** cada 5 min envía la bandeja y genera los PDF que falten; cada hora encola recordatorios (lun–vie 8–18 h); a las 6:10 trae INROCONTA y a las 6:20 copia las bases de cuentas.
- **Claves:** la de las huellas de cuentas y el token del reloj los generó la base (tabla `integraciones` y Vault): nadie los vio.

### Roles (todos con cuenta @inroprin.com)

| Rol | Qué ve | Qué hace |
|---|---|---|
| Persona | Sus rendiciones; los memos donde participa o le entregan dinero (solo sus líneas) | Rinde; da cargo si es destinataria |
| Emisor | Lo de sus áreas (menos lo confidencial) | Emite, corrige, adjunta sustentos |
| Jefe / suplente | Todo lo de su área | Aprueba, observa, anula |
| Interárea | Lo NORMAL de otras áreas | — |
| Ver KPIs | Métricas y KPIs | — |
| Verifica cuentas | Cuentas por verificar | Verifica o rechaza cuentas nuevas o distintas |
| Tesorería | Memos de pago aprobados de todas las áreas (no confidenciales) | Registra el estado del pago |
| Administración | Todo | Configura áreas, personas, roles y conexiones |

## 5. Lo que te toca hacer (una vez)

### Avance (al 7-nov-2026) — retomar el lunes 9-nov en el paso 5

| # | Paso | Estado |
|---|---|---|
| 1 | Publicar la app (unir a `main`) | ✅ Hecho |
| 2 | Gmail API y Sheets API activadas; Drive reconectado con permiso de Gmail | ✅ Hecho |
| 3 | Memo de prueba completo en el área **INROPRIN · Pruebas (INROMEMOS)** (`PRUEBAS`): emitir → aprobar → PDF en Drive → correos → cargo | ✅ Hecho (`001-2026-PRUEBAS`, quedó «Recibido») |
| 4 | Secreto `CORREO_MODO = real` en Supabase | ✅ Hecho |
| 5 | **INROCONTA** | ⏸️ **Pendiente: el lunes.** El Vercel de INROCONTA lo administra el practicante de Sistemas; hay que hacerlo con él |
| 6 | Bases de cuentas (IDs de las 3 hojas) | Pendiente: confirmar los IDs antes de cargarlos |
| 7 | Token de InroPay | Pendiente |

Quedó abierto en la prueba:

- Mirar el PDF regenerado de `001-2026-PRUEBAS` (membrete completo, sin bordes de planilla) y ajustar si Google lo dibuja raro.
- Probar con un segundo memo que, con correo real, cada aviso llegue a su bandeja sin «[PRUEBA]».
- Decidir si se agrega el interruptor **Activo** para desactivar personas en «Áreas y permisos de memos» (hoy no se pueden quitar).
- Al terminar las pruebas: desactivar el área `PRUEBAS` y cargar las personas, jefes y semillas reales.

### Los pasos

1. **Publicar la app:** unir la rama a `main` (pull request) para que se publique en GitHub Pages.
2. **Reconectar Drive** en Administración › Drive, para que la cuenta conectada dé también el permiso de **Gmail** (los avisos salen de esa cuenta). En Google Cloud (proyecto `inroscan-contabilidad`) activar **Gmail API** y **Google Sheets API**.
3. **Correo real:** hasta que el secreto de Supabase `CORREO_MODO` diga `real`, todo correo va solo a la cuenta conectada, con una franja que dice a quién iba.
4. **Configurar** en «Áreas y permisos de memos»: jefes y suplentes, quién emite dónde, roles (KPIs, interárea, verificador, Tesorería) y la semilla de cada serie.
5. **INROCONTA**, en tres partes:
   - A. En el repositorio de INROCONTA (PowerShell): `pnpm apps:token inromemos`. Imprime el **token** y una línea `inromemos=<sha256>`. No se pegan en chats.
   - B. En el proyecto de INROCONTA en Vercel › Settings › Environment Variables: a `APPS_DATOS_TOKENS` se le **agrega** `,inromemos=<sha256>` (sin borrar `carga-concar=…`), se guarda y se hace **Redeploy**.
   - C. En Supabase (foto-grama) › Edge Functions › Secrets: `INROCONTA_TOKEN` = el token; `INROCONTA_URL` = la dirección de INROCONTA (`https://….vercel.app`, sin barra al final).
   - Comprobar: «Áreas y permisos de memos» › Datos de INROCONTA › **Traer ahora**; los contadores dejan de estar en 0.
6. **Bases de cuentas:** cargar en la tabla `bases_cuentas` el ID de cada hoja (Nacional, Importaciones, RRHH) y su pestaña; la cuenta conectada a Drive tiene que poder leerlas.
7. **InroPay:** en «Áreas y permisos de memos» › Conexión con InroPay, generar el token y ponerlo en las propiedades del script de InroPay (GET la cola; POST `{memo, estado, detalle}`).

## 5b. Comentarios de Finanzas (9-nov-2026) — hechos

- **Sin corte entre pantallas:** la sesión se resuelve una vez por pestaña y la barra vive en el layout (`Marco`); al navegar solo cambia el contenido, con un fundido corto. Movimiento ligero en paneles y diálogos (≤ 220 ms; nada para quien pide menos movimiento).
- **Módulos separados:** arriba de la barra, *Memorandums | Rendiciones*; cada uno con su menú y su administración (y «General»: personas, catálogos, Drive). La rendición de viáticos sale de un memo de entrega; el memo escrito en Word queda como camino de transición.
- **Panel de memos compacto:** cifras en una franja (cada una lleva a su pestaña) y, al hacer clic en una fila, un **panel lateral** con lo esencial, los archivos (PDF, legajo, sustentos) y la **línea de tiempo** emisión → aprobación → envío → cargo → análisis → RG → programado → pagado, con el tiempo entre pasos (`lib/memo-linea.ts`).
- **KPIs para las jefaturas** (cada una ve sus áreas; administración y «Ver KPIs», todas): calidad de respuesta, tiempos de ejecución (incluidos los avisos por correo), **acogida** (después de cada acción la app pregunta «¿cómo te fue?» con cinco caritas: tabla `valoraciones`) y **auditoría externa** (tabla `auditorias`, la escribe solo el sistema).
- **Pendiente:** programar el agente externo que audite (p. ej. una vez al mes: correlativos sin saltos, memos aprobados con PDF en Drive, correos conciliados, estados de InroPay contra la base) y deje su informe en `auditorias`.

## 5c. Solicitar un memo (10-nov-2026)

- **Cualquier persona** pide un memo a un área (*Memorandums › Solicitar memo*, o *Rendiciones › Solicitar viáticos*): qué necesita, tipo, monto, beneficiario y, si son viáticos, las fechas.
- Llega a la **jefatura y a quienes emiten** en esa área (*Solicitudes*, con contador). Quien emite (o la jefatura) la **atiende** y nace el borrador ya llenado, con quien la pidió en copia; la **jefatura** puede **rechazarla** con su motivo. Quien la pidió la sigue en *Mías* y la puede cancelar mientras esté pendiente.
- **Control de ingreso:** «Emitir memo» aparece solo a quien está en un área; los demás solicitan. Toda emisión sigue pasando por la aprobación de la jefatura.
- **Pendiente:** aviso por correo de cada solicitud nueva a la jefatura (hoy el aviso está en la app).

## 5d. Distribución del diseño de Franco y funciones activables (11-nov-2026)

- **Estilo visual: el nuestro** (colores y letra INROPRIN). **Distribución: la del prototipo aprobado de Franco** (v2, 3-nov), traducida a nuestro estilo:
  - Menú: encabezado «Plataforma de Memorandums · Grupo INROPRIN · N empresas», y «Por aprobar», «Cargos pendientes» y «Seguimiento de pagos» con contadores.
  - Panel: «Sincronizado» + Sincronizar, Salud (panel lateral, solo administración), aviso del corte con cuántos memos entran, filtros de período, tipo y ejecución, Excel, lista agrupada por fecha con borde ámbar (espera aprobación) o rojo (fuera de meta), columna de pago y accesos al legajo y al PDF.
  - Teléfono: bandeja Por aprobar / Dar cargo / Mis memos, y aprobar desde la tarjeta.
  - Emitir: 5 pasos numerados (quién emite, qué quieres decir, datos de pago, sustentos, destinatarios y envío).
  - Detalle: botones en la cabecera, resumen en grilla, líneas de pago con su estado, línea de tiempo en dos carriles (documento y pago), tiempos del memo y trazabilidad memo → RG → programación → pago.
  - Métricas: tabla por empresa y área, y memos por semana.
- **Se quedó lo nuestro** donde Franco pidió otra cosa después del prototipo (franja de cifras compacta, panel lateral) o donde es más claro (datos de pago por tarjeta, bitácora, barra inferior en el teléfono).
- **Para conversar con Franco:** «Ver como», Análisis y Registro en el detalle, vistas y descargas, motivos de observaciones, auditoría de correlativos y «Legajos y archivo».
- **Funciones de INROMEMOS** (Áreas y permisos), con la etiqueta morada «Nuevo · INROMEMOS»: segundo control de pagos (encendido), cuenta verificada antes de pagar (encendido), Solicitar memo (apagado) y entrega de viáticos (encendido). Apagadas, la plataforma funciona como en el diseño original.

## 5e. Rendiciones más ágiles (11-nov-2026)

- **Proyectos:** si el proyecto no está en la lista, quien rinde lo propone desde la misma fila («＋ No está en la lista…») y sigue. Queda **por confirmar**; administración lo confirma, corrige o desactiva en *Catálogos*. Los memos solo ofrecen proyectos confirmados. Máximo 5 propuestas pendientes por persona.
- **Catálogos:** «Agregar varios…» (pegar una lista, sin duplicar), buscador y los proyectos por confirmar arriba.
- **Menos llenado:** conceptos agrupados por categoría; al escribir el RUC, el proveedor sale del padrón de SUNAT; la primera fila de una entrega de viáticos arranca con el proyecto del memo.
- **Control del viaje:** la rendición muestra las fechas del viaje y avisa (sin bloquear) los comprobantes de fuera de esas fechas.
- **Resumen por proyecto** cuando el gasto cae en más de uno, y la lista de rendiciones se actualiza sola al volver a la pestaña.

## 6. Lo que sigue

| # | Qué | Depende de |
|---|---|---|
| 1 | Membrete por empresa (logos de INROPLAS, GECOR, consorcios) en el PDF | Logos en el repositorio |
| 2 | Servicio central de correlativos para Fianzas e InroPay Programación | Fase de pruebas con Finanzas |
| 3 | Planilla: memo por concepto y centro de costo, lote con observación por memo | La planilla nueva de RRHH |
| 4 | Escribir las cuentas nuevas verificadas en las bases (hoy quedan en INROMEMOS) | Que Finanzas lo apruebe |
| 5 | Unir `proyectos` con los centros de costo de INROCONTA | — |

### Decisiones que siguen abiertas

- Códigos cortos de empresa y tipos de memo marcados «propuesto».
- Si se importan los 204 memos históricos del respaldo de foto-grama.
- Acordar con INROCONTA que memos y viáticos vivan en INROMEMOS (su v2 trae `006_viaticos.sql` del piloto INRO VIÁTICOS, parado desde el 8-oct).
