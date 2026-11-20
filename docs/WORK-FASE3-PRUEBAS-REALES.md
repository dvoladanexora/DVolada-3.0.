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
