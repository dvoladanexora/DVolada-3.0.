# Recuperación remota de Dvolada Online

Ensayo del PR 77 sobre el esquema de 6ab85d7. Se creó dvolada-qa-restore-drill exclusivamente para datos sintéticos. Nunca asociar esta base a un Worker comercial. Reutilizarla en futuros ensayos.

## Recuperación comprobada

1. Aplicar las migraciones 0001–0021 a la D1 de ensayo. Registrar el inventario de sqlite_schema, ejecutar PRAGMA quick_check y PRAGMA foreign_key_check y guardar una referencia ficticia conocida.
2. Obtener el bookmark D1 Time Travel de esa base y guardar su identificador de base por separado. Modificar el registro ficticio y confirmar la lectura del nuevo valor.
3. Solicitar la restauración al bookmark en la misma base de ensayo. Conservar el previous_bookmark de la respuesta para poder deshacerla. Esperar y verificar con lecturas nuevas antes de reabrir escrituras.
4. En este ensayo el nombre volvió de «Cambio posterior» a «Restaurante ficticio», el inventario recuperó los 114 objetos registrados, quick_check devolvió ok y foreign_key_check devolvió cero filas. La API remota rechazó integrity_check con SQLITE_AUTH. La comprobación completa se puede ejecutar sobre una copia SQLite aislada.
5. Cloudflare completó además una exportación SQL de la base sintética después de la prueba de crecimiento. La recuperación observada fue mediante Time Travel. Se descargó el archivo, SHA-256 0c0eada45cead41205887751cd1ee90256a9500d9a61ff1361ef801db91cc866, y se importó en una segunda D1 vacía, dvolada-qa-restore-validation. Cloudflare procesó 9517 sentencias. Se recuperaron 401 restaurantes, 1000 clientes y 8000 productos. quick_check devolvió ok y foreign_key_check cero filas. Se ejecutó el manejador real de catálogo localmente con su consulta SQL transmitida a la segunda D1 y su respuesta devuelta al manejador. Respondió HTTP 200 con los primeros 100 restaurantes en orden. El ensayo no desplegó un Worker de prueba.

## Rendimiento reproducido

Se cargaron 400 restaurantes abiertos, 1000 clientes y 8000 productos sintéticos, además del restaurante cerrado del ensayo. Cinco lecturas simultáneas de la consulta real del catálogo devolvieron 100 filas por lectura. Antes del índice, D1 registró 801 filas leídas por consulta y una mediana de 0,7913 ms. Con la migración 0022 registró 100 filas y 0,5078 ms. Son tiempos internos SQL. La ruta lista como máximo 100 restaurantes. La capacidad de checkout y la latencia en teléfonos requieren mediciones separadas.

## Política propuesta para operación comercial

Exportar diariamente y antes de cada migración. Conservar exportaciones cifradas fuera de la cuenta operativa durante 30 días, con acceso restringido. Registrar SHA-256, hora UTC, versión del Worker y última migración. Alertar al operador si faltan una exportación diaria o su verificación. Ensayar cada mes la importación en una base independiente y medir tiempo y pérdida de datos. Esta política requiere configurar destino, responsables, retención y alertas al aprobar la infraestructura comercial.

Ante una incidencia, suspender las escrituras, registrar el último pedido confirmado y tomar una copia del estado afectado. Restaurar en aislamiento cuando se disponga de un archivo exportado. Comparar pedidos, eventos, totales, liquidaciones y relaciones con el registro de operaciones. Identificar las escrituras posteriores al punto recuperado y conciliarlas antes de habilitar pedidos. Verificar primero salud y catálogo y después una compra ficticia en el entorno aislado. Autorizar por separado el cambio de binding comercial. Conservar la base previa y documentar la hora de reapertura.

La corrección posterior pagina por nombre e identificador. El cliente recorre las páginas automáticamente. Una prueba del cliente contra el Worker recuperó 400 negocios en cuatro páginas, incluidos 398 con igual nombre. La rama aprobó 289 pruebas locales. Las medidas SQL anteriores corresponden al SELECT original de 100 filas; la consulta paginada solicita una fila adicional para detectar la página siguiente.

## Continuidad del candidato

QA publicó bc78ca6d43d903b7c1b96bc4260f7d37b7d38287 en la versión f37629c0-02ef-41bc-87f8-a45391bcef68. Se verificaron /health, /version.json y catálogo. GitHub Actions 950 aprobada. La Beta continúa en 7675749, versión f73f4eb4-c182-44d5-a8e2-30492eabe350. La migración 0022 solo se aplicó en las D1 de ensayo. El Worker paginado es compatible con 0021.

La prueba local adicional de checkout ejecutó 200 solicitudes concurrentes (100 intenciones y sus reintentos) de 100 clientes distribuidos entre 20 restaurantes con el Worker y SQLite aislados. Hubo exactamente 100 pedidos persistidos. No usar el tiempo local para estimar capacidad remota. En la Beta publicada, Chromium a 360 px mostró los tres roles y el botón dentro del ancho disponible. La matriz física está en BETA-CERRADA.md.

Continuar por la medición de checkout extremo a extremo en un Worker aislado con D1 remota, incluyendo latencia p95, errores, CPU y filas facturables. Dimensionar el costo según el tráfico medido. La política de copias, alertas y retención sigue pendiente de implementación en el entorno comercial. Cuota propuesta L 750 mensuales por restaurante, pendiente de aprobación. Definir vigencia, cortesía, liquidaciones y presupuesto de incentivos antes de activar cobros.
