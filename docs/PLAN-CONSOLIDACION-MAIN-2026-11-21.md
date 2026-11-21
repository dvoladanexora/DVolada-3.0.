# Dvolada — consolidación controlada para `main`
**Fecha:** 2026-11-21. **Estado:** candidata de integración; **NO autorizada para lanzamiento público**.

## Alcance verificado
Repositorio `dvoladanexora/DVolada-3.0.`. En la revisión inicial había **79 ramas** y **8 PR abiertos**; ningún PR estaba fusionado a `main`. GitHub mostró las ocho ramas con PR en estado de revisión/CI pasada en su último commit, aunque PR #68 y #69 eran ramas antiguas divergentes.

### Dos cadenas de trabajo que NO deben fusionarse a ciegas
| Grupo | PR | Rama | Dependencia | Acción |
| --- | --- | --- | --- | --- |
| Colores y auditoría | #75 | `prelaunch/phase-1-audit-theme` | `main` | Conservar |
| Workers/D1 | #76 | `prelaunch/phase-2-worker-d1` | Contiene #75 | Conservar |
| React QA y OneSignal | #77 | `prelaunch/phase-3-live-integration` | Contiene #75 y #76 | Base de candidata |
| Restaurante Cloud | #72 | `feature/restaurante-caja-cocina-2026-11` | `main` | Conservar |
| Repartidor | #73 | `feature/repartidor-online-work-2026-11` | #72 | Conservar |
| Auditoría Online anterior | #74 | `audit/online-integral-work-2026-11` | #72 y #73 | Fuente de integración |
| Checkout histórico | #68 | `fix/revision-checkout-2026-11-09` | Rama divergente | Revisar paridad, no fusionar directamente |
| Offline histórico | #69 | `actualizaciones/modo-sin-conexion` | Rama divergente | Revisar paridad, no fusionar directamente |

**No basta con unir todas las referencias Git:** las 79 ramas incluyen parches, experimentos, trabajo acumulado y prototipos de fechas distintas. Un historial divergente no prueba por sí solo que falte funcionalidad: comprobar el código y las pruebas antes de seleccionar cambios.

## Candidata de consolidación
Rama: `integration/dvolada-main-candidate-20261121`.

1. Parte del commit `6654ade` de PR #77 (React QA/D1 y CSP de OneSignal corregidos).
2. Incorpora **78 archivos auditados e independientes** de PR #74 sin sobrescribir las correcciones de PR #77.
3. Integra los scripts de test de restaurante, repartidor, seguridad y regresión, conservando los tests y dependencias de React QA.
4. Amplía la CI para ejecutar `npm run test:all`.
5. Se excluyó el `package-lock.json` de PR #74 por corresponder a otro `package.json` y otra versión de Sharp; **regenerar y revisar un lockfile consistente antes de fusionar**. No usar `npm ci` con un lockfile que no corresponda.

**Archivos comunes con cambios independientes todavía por reconciliar individualmente:**
- `.github/workflows/deploy.yml`
- `.github/workflows/validate-pr.yml` (tests históricos añadidos; contrastar controles PostgreSQL y auditoría de dependencias)
- `index.html`
- `package.json` (scripts incorporados; regenerar lockfile)
- `public/sw.js`
- `src/PwaUpdatePrompt.jsx`
- `src/main.jsx`
- `src/style.css`

La candidata mantiene las versiones de PR #77 en estos ocho archivos, con la ampliación explícita de `package.json` y la CI. **Eso no equivale a haber conciliado todos los cambios de PR #74.**

## Política de publicación
`main` activa `.github/workflows/deploy.yml` y puede publicar la demo de GitHub Pages automáticamente. Por lo tanto **no fusionar a `main` ni activar auto-merge** hasta decidir si esa publicación es aceptable o bloquear el despliegue automático de forma explícita. No ejecutar compras reales ni cambiar despliegues de producción por esta consolidación.

Los Workers `dvolada-qa`, `dvolada-api-staging` y D1 `dvolada-staging` son pruebas, no producción. Variables privadas, claves de OneSignal y cuentas temporales **no se copian** a GitHub. El modo de pedidos de QA no debe propagarse como bandera de producción.

## Evidencia existente, sin confundir alcance
- PR #77 pasó tests de frontend/Worker y pruebas de cuatro pedidos ficticios por interfaz con persistencia D1; QA interno = GO, producción = NO-GO.
- Una notificación manual de OneSignal QA llegó al Samsung S23 Ultra mediante Chrome. No están demostrados todavía los avisos transaccionales por pedido ni la distribución entre roles.
- En Chrome/Chromium remoto pasaron distintas anchuras y temas; faltan S23/S24/iOS físicos, prueba de banner emergente, instalación PWA y regresiones completas después de integrar ramas.

## Puertas para marcar esta candidata «lista para fusionar»
- [ ] CI nueva candidata **verde** con todos los tests, incluido `test:all` y la compilación React QA y demo.
- [ ] Resolver y revisar las ocho coincidencias de archivos, sin perder código del servidor actual ni funcionalidades auditadas.
- [ ] Validar `server/` PostgreSQL legado en entorno descartable si se conserva y etiquetarlo como NO producción; verificar que no compite con Workers/D1.
- [ ] Comprobar cobertura/paridad de PR #68 y #69 y las ramas históricas relevantes antes de cerrarlas; no insertar código antiguo que revierta un arreglo reciente.
- [ ] Regenerar lockfiles, revisar dependencias/auditoría y garantizar instalación reproducible.
- [ ] Cero secretos ni datos reales en Git, paquetes o artefactos.
- [ ] Realizar QA visual de los paneles integrados; verificar roles, idempotencia, PIN, carrito, offline, temas y D1 aislada.
- [ ] Decidir y documentar el efecto de despliegue a GitHub Pages al fusionar `main`; aprobación explícita para el cambio de publicación.
- [ ] Revisar el PR consolidado; solo después autorizar fusión y archivar los PR duplicados, sin borrar ramas de trabajo relevantes.

## Estrategia recomendada
**Una sola fusión consolidada y revisada** desde esta candidata a `main`, solo después de cumplir las puertas anteriores, en lugar de mezclar directamente ocho PR y disparar publicaciones parciales. Conservar #72–#77 como fuentes auditables hasta comprobar la paridad y no declarar un PR obsoleto «fusionado» solo por cerrar el ticket.


## Primera validación de esta candidata (2026-11-21)

- GitHub Actions PR #78: **job `qa-smoke` aprobado** con pruebas de cliente/API, acceso, push, PWA y Worker SQLite, además de compilación React QA y demo. Esto valida construcción y regresiones automatizadas de la versión React, **no** es autorización para desplegar ni prueba física.
- **Job PostgreSQL legado aprobado** con base descartable. Se conserva separada de D1, sin promesa de despliegue.
- **Suite histórica combinada: 196/234 aprobadas; 38 fallidas.** Ejecutar `npm run test:all` para reproducir. Entre los fallos hay expectativas de navegación demo antigua, lógica de pedidos locales, caché, privacidad, acceso por rol y publicación. Un test de texto fallido no demuestra por sí solo un error de servidor, pero tampoco puede ignorarse.
- Se restauraron el enlace accesible «Saltar al contenido», marcas móviles de página, CSS de foco y carga diferida del panel de compartir/instalar.
- El workflow de GitHub Pages de esta candidata **ya requiere ejecución manual, rama `main` y repositorio exacto**, además de las pruebas. En `main` todavía rige el workflow automático anterior hasta que se fusione esta candidata.
- **NO cambiar el estado de borrador ni fusionar** mientras `verify` siga en rojo. Los ocho archivos solapados requieren revisar paridad; migraciones y secretos de QA no deben convertirse en configuración de producción.

Ver GitHub Actions y resultados: https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44915510042
