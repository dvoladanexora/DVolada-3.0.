# Dvolada Online — entrega final para QA real con Work
**Fecha de corte:** 20 de noviembre de 2026 (UTC).
**Rama exclusiva de pruebas:** `audit/online-integral-work-2026-11`.
**Pull request:** [#74](https://github.com/dvoladanexora/DVolada-3.0./pull/74), **borrador, sin fusionar**.
**Última validación de código:** [Actions #44671145386](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44671145386): **168/168 pruebas**, cero fallos/omitidas, chequeo preliminar del servidor y compilación de producción exitosa.

## Objetivo autorizado para Work
**Realizar pruebas funcionales y visuales con datos ficticios en un navegador real** de Cliente, Restaurante/Caja, Cocina y Repartidor independiente; registrar evidencias y defectos reproducibles. **No** modificar código por iniciativa propia, desplegar, fusionar, ejecutar cobros ni conectar sistemas de producción. Devolver incidencias al desarrollo para corregirlas en esta rama. Solo realizar cambios adicionales si el usuario los autoriza explícitamente.

## Preparación exacta del entorno
Usar el repositorio `dvoladanexora/DVolada-3.0.` (el punto final forma parte del nombre).
Desde una copia de trabajo con las credenciales GitHub propias del entorno:

```bash
git fetch --all --prune
git checkout audit/online-integral-work-2026-11
npm install --no-audit --no-fund
npm run test:all
npm run check:server
npm run build
VITE_DVOLADA_INTERNAL_PREVIEW=true npm run dev -- --host 0.0.0.0
```

La variable `VITE_DVOLADA_INTERNAL_PREVIEW` **solo habilita vistas DEV**: no es un mecanismo de autenticación. No utilizar números de teléfono, nombres, direcciones o PIN reales. Usar perfil de Chrome y Safari sin datos previos de otros proyectos. No publicar un build DEV con vista interna. Abrir el cliente, utilizar **«Ya soy parte de Dvolada»** para los portales internos de prueba y seleccionar el restaurante y repartidor de demostración según la interfaz. Al terminar, cerrar todas las sesiones de prueba.

## Matriz de aceptación — pruebas manuales prioritarias
| ID | Área | Prueba real | Resultado obligatorio |
|---|---|---|---|
| E01 | Cliente | Inicio, restaurante/productos, filtros y regreso al catálogo | No salta a otro restaurante ni pierde la navegación |
| E02 | Cliente | Crear producto nuevo de menú con UUID, agregarlo sin extras y pedir | Producto válido no se marca falsamente fuera del catálogo |
| E03 | Cliente | Personalizar extras, cantidades, instrucciones y repetir pedido UUID | Precios exactos, ID correcto, opciones conservadas |
| E04 | Cliente | Carrito con 2 restaurantes, confirmar, recibos y PIN | Órdenes independientes y totales reconciliados |
| E05 | Cliente | Doble toque del deslizador y errores de cuota de almacenamiento | Una sola confirmación; sin falsa notificación de éxito |
| E06 | Cliente | Programar en horario nocturno y en horario cerrado | Respeta horarios, fecha y validaciones |
| E07 | Cliente | Cancelar Pendiente; solicitar cancelación en Preparando | Caja recibe revisión y no se pierden estados |
| E08 | Caja | 40+ pendientes, 15+ programados vencidos y 15+ futuros | Buscar, paginar y activar sin omitir pedidos |
| E09 | Cocina | 80+ órdenes repartidas en las tres etapas | Paginación, comanda, cronómetros y estados correctos |
| E10 | Menú | 100 productos, fotos, 8 extras válidos y 9 extras inválidos | 9 extras produce error visible, no truncado silencioso |
| E11 | Restaurante | Dos restaurantes diferentes, pausa/cierre y horario | No se mezclan inventarios ni pedidos |
| E12 | Repartidor | Aceptar dos ofertas, intentar una tercera | Máximo dos activas por identidad de prueba |
| E13 | Repartidor | Recoger → recorrido → llegada → PIN incorrecto/correcto | Sin saltos de estados ni entrega falsa |
| E14 | Repartidor | 30+ ofertas, 40+ históricas, mapa, GPS opcional | Listas fluidas, no se comparte PIN en las ofertas |
| E15 | Multi-pestaña | Dos pestañas del MISMO origen guardan pedidos distintos y el mismo menú | Los cambios secuenciales se preservan; conflictos evidentes |
| E16 | Sin conexión | Cortar internet antes/durante pedido, cambio de estado y foto | Carrito/datos conservados, ningún éxito falso |
| E17 | Recursos | Simular fallo de descarga de un chunk, red lenta, límite local | Error recuperable; nada de pantalla en blanco |
| E18 | PWA | Instalar/actualizar iPhone Safari y Android Chrome con carrito | No borra datos silenciosamente ni envía pedidos offline |
| E19 | Accesibilidad | Tab, Enter, flechas, Escape, lector de pantalla, texto grande | Foco visible, diálogos navegables y avisos comprensibles |
| E20 | Impresoras | Comanda 58/80 mm; bloqueo de ventanas emergentes | Productos y extras legibles; no exponer teléfono, dirección ni PIN |

## Dispositivos y modos
- **Móvil pequeño:** iPhone 6S o simulación equivalente (y dispositivo real si disponible); Safari, viewport estrecho, teclado en pantalla, rotación, modo oscuro.
- **Android:** Chrome en teléfono real; PWA instalada, notificaciones, modo sin conexión, navegación táctil y accesos de repartidor.
- **PC:** Chrome/Edge, 1366×768 y 1920×1080, teclado sin mouse, vista Caja/Cocina con muchos pedidos.
- **Red:** conexión normal, limitación 3G, offline, reconexión, caché caliente/fría y actualización del service worker.

## Qué significa «aprobado»
- Sin P0: datos cruzados entre negocios, pedido duplicado, total incorrecto, estado falso, PIN expuesto al repartidor, errores de autorización si hubiera servidor, pérdida de información al guardar o pantalla totalmente inutilizable.
- Todo P1 debe incluir reproducción, evidencia, logs y responsable de corrección; puede ser bloqueante para la entrega si afecta caja/cocina/repartidor.
- P2: mejoras de estética o comodidad sin impedir operaciones; documentar aparte.

Por cada incidencia, Work debe registrar: **ID**, panel, entorno/navegador, commit, pasos numerados, datos ficticios usados, resultado esperado vs obtenido, captura de pantalla o video, consola/red relevante y severidad **P0/P1/P2**. Proponer corrección técnica si es posible, **sin hacerla** salvo autorización.

## Restricciones conocidas: NO tratar como defectos nuevos de UI
- La demostración usa `localStorage`; dos *dispositivos distintos* **NO** se sincronizan. Solo la API central permitirá operaciones reales multiusuario.
- Los choques simultáneos exactos entre pestañas no son transaccionales: `localStorage` carece de bloqueo atómico. El frontend sí detecta muchos conflictos **secuenciales**.
- La API Node/PostgreSQL de `server/` es **preliminar y no conectada a React**; falta construir la API comercial de pedidos, identidad, permisos, PIN, asignaciones y cobros en un proyecto separado.
- La ubicación GPS, cobros, chats, transferencias, liquidaciones y avisos son solo pruebas locales o funciones no integradas; no prometer operaciones reales.
- No hay certificación de experiencia de usuario o rendimiento real hasta que Work complete las pruebas manuales anteriores.

## Resultado requerido de Work
1. **Resumen de cobertura:** aprobado, observado o fallido para cada E01–E20.
2. **Listado de defectos priorizado:** evidencias y reproducción exacta de todos los P0/P1/P2.
3. **Matriz de dispositivos:** qué se probó realmente y qué quedó sin cobertura.
4. **Veredicto separado:** `frontend demo para revisión` vs `operación comercial con backend`; jamás confundir ambas.
5. **Decisión final del usuario:** solo después de aprobar las pruebas, decidir fusionar/publicar o seguir corrigiendo.

Documento ampliado: `docs/WORK-ENTREGA-INTEGRAL-ONLINE.md`. Mantener PR #74 como borrador mientras se ejecuta el QA.


## Gate adicional de publicación (posterior a E01–E20)
**E21 — Protección del público frente a pedidos ficticios.** Probar localmente un build **de producción** (sin activar ninguna bandera DEV): la navegación por el catálogo es posible, pero iniciar checkout o confirmar una orden debe informar que Dvolada todavía no tiene pedidos comerciales habilitados. No deben crearse filas `dv_orders` nuevas ni mostrarse números de pedido como recibidos por restaurantes.

En contraste, al ejecutar `VITE_DVOLADA_INTERNAL_PREVIEW=true npm run dev`, Work **sí debe poder probar los pedidos ficticios** de E01–E20. Mantener esta condición claramente separada en los resultados.

**Nota:** E21 es un gate de seguridad de publicación; no obliga a desplegar el frontend al público para efectuar la comprobación.

## Controles de seguridad para Work (solo entorno de pruebas autorizado)

**S01 — XSS:** escribir textos ficticios con caracteres HTML en productos, notas, direcciones, mensajes y cancelaciones. Deben mostrarse como texto, no ejecutar código. Imprimir comandas y exportar CSV para verificar el escape.

**S02 — Aislamiento de negocios:** abrir A y B en sesiones distintas de prueba. Un empleado de A no debe ver ni cambiar pedidos de B. En demo local esto no prueba permisos reales; debe repetirse cuando exista backend autenticado.

**S03 — Revocación:** al conectar el proveedor de identidad, desactivar la membresía de un empleado en BD mientras conserva el token. Toda consulta/modificación posterior debe devolver 403. Probar roles de Caja, Cocina, gerente y usuario inexistente.

**S04 — Repartidor y PIN:** ofertas solo incluyen cantidades y negocio, nunca datos del cliente; asignados ven únicamente datos necesarios. Nunca mostrar PIN ni secretos en panel repartidor o respuestas API.

**S05 — Antifraude:** modificar en el navegador el importe, ID de negocio, descuentos, estado y PIN; los cambios no deben ser aceptados por el servidor real. Verificar límite global de dos entregas por repartidor entre móviles.

**S06 — API:** solicitudes sin JWT, JWT vencido, firma incorrecta, rol ajeno, ID de otro restaurante, JSON inválido, límite de bytes, idempotencia repetida y solicitudes excesivas deben devolver 401/403/400/409/413/422/429 según corresponda, sin errores internos ni filtraciones de información.

**S07 — Publicación:** el build de producción debe impedir pedidos ficticios; la vista demo de Vite solo puede abrirse localmente. Verificar HTTPS, CSP/HSTS, políticas de origen, WAF, alertas y controles de almacenamiento antes de exponer una API real.

**S08 — Dependencias:** el corte de auditoría debe tener resultado npm audit sin vulnerabilidades altas o críticas; generar lockfiles y verificar instalación reproducible antes del lanzamiento. Revisar alertas de GitHub/Dependabot.

**IMPORTANTE:** S02–S07 contienen pasos bloqueados por ausencia del backend comercial. Work debe marcarlos como **NO EVALUABLE — requiere API real**, no declararlos aprobados por pruebas de localStorage. No realizar pruebas de carga agresivas ni de explotación sobre dominios públicos sin autorización específica.

Informe de seguridad: docs/SEGURIDAD-PUBLICACION-AUDITORIA.md.


## Seguridad adicional para revisar antes de publicar (S09–S14)

**S09 — Imágenes externas y archivos:** una URL HTTPS pública válida debe renderizarse; `https://127.0.0.1`, `https://localhost`, IP de intranet, URL sin HTTPS y SVG deben rechazarse. Subir JPG/PNG/WebP de menos de 5 MB; rechazar fotos de más de 30 megapíxeles. Verificar iPhone 6S por limitaciones de memoria.

**S10 — Exportación Local/Plus:** comprobar que un nombre de cliente con `=1+2`, un carácter invisible Unicode antes de `=1+2` o `@SUM(...)` aparece como texto al abrir CSV, nunca como fórmula. Comprobar impresión desde Caja sin scripts ni ventana que acceda al panel principal.

**S11 — Desarrollo aislado:** `npm run dev` solamente escucha en `127.0.0.1`. Si Work requiere acceso de un navegador remoto puede usar `npm run dev -- --host 0.0.0.0` **únicamente en una instancia aislada con datos ficticios**, nunca en una red abierta ni una máquina que contenga datos comerciales.

**S12 — Arranque servidor:** en un entorno aislado comprobar que sin origen HTTPS y `DVOLADA_ALLOWED_ORIGINS` la API no inicia como `NODE_ENV=production` ni cuando intenta enlazar `0.0.0.0`. Con configuración válida debe conservar aislamiento de restaurantes y responder sin secretos en errores.

**S13 — Paquete público:** ejecutar `npm run build` y verificar que `dist/device-studio.html` **no exista**. Confirmar que `index.html` usa `referrer=no-referrer`. Comprobar que la PWA, catálogo y flujo de prueba interno siguen funcionando sin ese archivo.

**S14 — Publicación bloqueada hasta dependencias reproducibles:** generar, revisar y versionar `package-lock.json` y `server/package-lock.json` y luego ejecutar `npm ci`. El workflow de despliegue no debe publicar si falta cualquiera de esos archivos, si falla `npm audit` o si hay pruebas fallidas.

No dar S10–S14 por aprobados mediante lectura estática solamente. Work debe dejar evidencia de navegador y de instalación/servidor, marcando **NO EVALUABLE** los pasos que necesitan backend aún no implementado.

## S15–S18 — Revisión final de permisos, dependencias y datos del dispositivo

**S15 — Revocación en plena operación:** cuando exista backend comercial, iniciar un cambio de estado con dos dispositivos, revocar el acceso del empleado antes de confirmar y verificar que el servidor devuelve 403. Probar también un cambio de rol Caja → Cocina y plan Online → inactivo. **NO EVALUABLE** sin base de datos y proveedor de identidad reales. La regla está cubierta provisionalmente por pruebas unitarias de consulta SQL.

**S16 — Cookies y sesiones:** comprobar en red que la API con bearer token no envía cookies de sesión involuntarias; la sonda de `/health` no debe enviarlas. No almacenar tokens reales en `localStorage`.

**S17 — Borrar mis datos del dispositivo:** con datos ficticios, añadir favoritos, direcciones y un pedido de prueba. Desde Mi perfil, confirmar `Borrar mis datos de este dispositivo`. Deben desaparecer esos datos tras recargar; otro negocio de la demostración no debe perder su menú ni sus preferencias. Repetir en dispositivo móvil. Si hay dos pestañas abiertas, cerrarlas antes para evitar que reescriban datos.

**S18 — Lockfiles y publicación segura:** comprobar `npm ci` en frontend y servidor, auditorías npm y `npm run test:all`. Los flujos manuales de GitHub Pages no deben desplegar desde ramas distintas de `main`. No fusionar ni publicar durante QA sin autorización.

**Persisten como NO EVALUABLE:** pruebas reales de autorización, pagos, PIN comercial, WAF y base de datos PostgreSQL hasta que esos servicios estén implementados y conectados.


## S19–S21 — Validación de seguridad con PostgreSQL real

**S19 — Aislamiento de API y SQL:** ejecutar `npm --prefix server run test:db` exclusivamente contra la base `dvolada_security_test` descartable. Revisar que A no pueda leer B y que tanto el JWT como permisos revocados sean rechazados. Confirmar que la migración `004_online_event_integrity.sql` impide crear eventos de otros negocios.

**S20 — Concurrencia e idempotencia:** confirmar que dos empleados con la misma versión de pedido no consiguen dos actualizaciones, y que una clave reutilizada en negocios distintos no cruza resultados. En la app comercial, repetir con dispositivos reales y las sesiones verdaderas.

**S21 — Cabeceras y abuso:** rechazar JSON mayor de 4 KB, cerrar la conexión tras 413, invalidar cursores alterados y rechazar orígenes externos no autorizados. En producción comprobar WAF, límites distribuidos por IP/cuenta y registros sin datos sensibles.

**Importante:** la suite PostgreSQL sí usa una base real, pero **sigue siendo una API preliminar sin frontend comercial conectado**. No marcar pruebas de pagos, entrega, PIN, notificaciones o fraude como aprobadas sin implementar esos servicios.


## S22–S24 — Controles de solicitudes y revocación a mitad de pedido

**S22 — Ataques de solicitudes antes de iniciar sesión:** ejecutar pruebas limitadas solo en el entorno aislado de CI. Con tokens falsos y un encabezado `X-Forwarded-For` distinto por petición, la API debe devolver 429 y `Retry-After` después de alcanzar el límite por socket, sin derribar PostgreSQL. Este límite no acredita un WAF distribuido.

**S23 — Revocación bajo bloqueo:** iniciar una transacción de administrador que bloquee la membresía y la desactive; enviar un cambio de estado con la sesión emitida previamente. Verificar con PostgreSQL `pg_stat_activity` que está esperando el bloqueo; al confirmar la revocación, el estado y eventos no deben cambiar y la API debe devolver 403. La prueba ya está automatizada en `server/tests/security-postgres.test.js`.

**S24 — Limpieza e integridad:** ejecutar la limpieza SQL sobre datos ficticios; debe eliminar únicamente claves vencidas y nunca registros de pedidos o eventos ni claves todavía válidas de otros negocios. Probar que el cliente API rechaza 302/307 de manera segura sin seguir redirecciones con token.

Estos escenarios no equivalen a prueba de penetración en producción; no enviar carga deliberada a sitios públicos, otros negocios ni cuentas reales.


## S25 — Colores oficiales en Samsung S23 Ultra, S24 Ultra, iPhone y PC

**Preparación:** probar con la misma versión de Dvolada, navegador actualizado y PWA reinstalada o recargada. Registrar navegador, versión Android/iOS, modo de pantalla y si están activos los colores de accesibilidad o el modo oscuro forzado.

**Pasos:** en S23 Ultra y S24 Ultra abrir Dvolada en Chrome y Samsung Internet; repetir instalada como PWA. Alternar **Claro, Oscuro, Automático**, cambiar el modo del sistema mientras la app está abierta, recargar y cerrar/reabrir. Repetir en iPhone Safari/PWA y PC Chrome. Revisar Cliente, Restaurante, Repartidor, formularios, botones, barra superior, menús y notificaciones.

**Esperado:** el naranja oficial **#f26732** se mantiene como acento en todos los dispositivos; Claro usa fondo claro y Oscuro fondo oscuro; Automático reacciona al cambio del sistema sin recarga. Ningún dispositivo puede cambiar el acento mediante un color guardado anteriormente en `dv_brand`. En modo alto contraste se respeta la configuración de accesibilidad.

**Evidencias:** capturas de los tres modos por dispositivo, captura de PWA y resultado del cambio en vivo. Si hay rojo/verde, comprobar en las herramientas del navegador el valor calculado de `--accent`, `data-theme`, hojas CSS efectivas y configuración de Samsung; no asumir que la causa está cerrada hasta verificar el S24 Ultra físico.

**Implementación de código:** `src/brand-theme.js` centraliza el acento y tema, `src/main.jsx` elimina el selector de acento por dispositivo y escucha `prefers-color-scheme`, `src/style.css` alinea controles nativos y `tests/brand-theme.test.js` protege el comportamiento.
