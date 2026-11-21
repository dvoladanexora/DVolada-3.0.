# Web Push en React QA

El origen exacto es https://dvolada-qa.dvoladanexora.workers.dev. La app OneSignal de Pages sigue vinculada a https://dvolada-web-staging.pages.dev.

Para activar suscripciones en React QA, crear una app OneSignal de prueba para el origen React, habilitar Token Identity Verification para External ID y guardar su clave ES256 en el secreto Worker `QA_ONESIGNAL_SIGNING_KEY`. Configurar `QA_ONESIGNAL_APP_ID`, `QA_ONESIGNAL_ORIGIN` y confirmar la verificación en el panel antes de poner `QA_ONESIGNAL_IDENTITY_VERIFIED=true`. Las rutas de diagnóstico usan HTTPS. Sin esa configuración `/push-config` devuelve `enabled:false` y el cliente no inicializa el SDK.

El service worker de empuje tiene scope `/push/onesignal/`. El de la aplicación conserva el scope `/`. Las identidades se firman a partir de la sesión autenticada, caducan en cinco minutos y están separadas por cuenta. El navegador recibe únicamente el App ID público y un JWT temporal. El permiso del navegador se revoca desde la configuración del sitio. La acción Desactivar en React también desuscribe y desvincula la sesión de la app OneSignal.

Antes de activar envíos transaccionales, vincular cada evento de pedido con su audiencia obtenida de D1. Verificar en dos perfiles de navegador separados que un destinatario recibe una sola notificación, que los demás perfiles no la reciben y que en el dispositivo que revocó el permiso no se entrega. Mantener desactivados los envíos de pedidos mientras falte esa evidencia.
