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
