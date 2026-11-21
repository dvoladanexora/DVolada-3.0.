# Dvolada Online — preparación integral para Work

Plataforma de pedidos que conecta clientes, restaurantes y repartidores **independientes**. Este repositorio contiene la experiencia de frontend y las herramientas de demostración local, **no un servicio de pedidos operativo en producción**.

**Lectura inicial para Work:** [Plan de entrega y criterios de lanzamiento](docs/WORK-ENTREGA-INTEGRAL-ONLINE.md).

- Panel Cliente: catálogo, carrito por restaurante, extras, pedidos de demostración, historial, instalación PWA.
- Panel Restaurante Online: Caja, Cocina/KDS, Mi menú, ficha comercial, comandas.
- Panel Repartidor Online: ofertas, límite de 2, ruta, GPS con consentimiento, recogida, PIN e incidencias.
- Dvolada Local y Plus tienen alcance separado. No activarlos ni fusionarlos con este producto durante la revisión Online.

## Comandos

```bash
npm install --no-audit --no-fund
npm run test:all
npm run check:server
npm run build
# Portal de demostración interno SOLO en servidor de desarrollo:
VITE_DVOLADA_INTERNAL_PREVIEW=true npm run dev
```

## Precaución

No publicar perfiles de pruebas ni pedidos reales desde GitHub Pages. Las órdenes actuales son locales y no se sincronizan entre dispositivos. El servidor Node/PostgreSQL bajo `server/` es una propuesta preliminar **no conectada**; si Work elige Workers + D1 debe establecer nuevo contrato, roles, sesiones, migraciones y pruebas.
