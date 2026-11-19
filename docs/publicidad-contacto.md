# Publicidad no intrusiva — Dvolada

Se muestran dos espacios de publicidad interna en el feed de comida: carrusel y tarjeta compacta. Cada uno rota automáticamente cada 5 segundos mientras está visible, no está en pausa y la persona no pidió reducir animaciones. Se puede deslizar en móvil, utilizar controles o pausar.

Las tarjetas son **autopromociones para reservar espacio**, no anuncios pagados ni promesas de descuentos. El botón abre un formulario con nombre, negocio, teléfono, municipio, tipo de espacio y comentario.

## Entrega de consultas en la versión estática
El sitio actual está alojado en GitHub Pages, **sin un servidor público que guarde solicitudes**. El formulario prepara un correo a `dvoladanexora@gmail.com` (contacto provisional del proyecto) y abre la aplicación de correo del interesado. Es indispensable que pulse **Enviar**. También puede copiar la solicitud. La interfaz nunca afirma que se recibió un envío automáticamente.

Se puede modificar el destinatario con `VITE_DVOLADA_PUBLICIDAD_EMAIL` al compilar. Para habilitar WhatsApp usar `VITE_DVOLADA_PUBLICIDAD_WHATSAPP` con un número comercial confirmado en formato internacional, solo dígitos (por ejemplo, prefijo 504 seguido del teléfono); hasta entonces no se muestra un enlace inventado. El usuario debe pulsar Enviar en WhatsApp.

No almacenar automáticamente nombres, teléfonos ni consultas en `localStorage`. **Antes de ofrecer envío directo dentro del sitio**: implementar endpoint HTTPS con validación, protección antiabuso, almacenamiento centralizado y acceso privado a solicitudes, además de una política de privacidad.

## Antes de activar campañas de pago
Se necesita un catálogo de anuncios aprobado (imagen, enlace, anunciante, vigencia, destino, frecuencia), identificador visible **Publicidad**, métricas agregadas sin información personal y un panel privado de administración. Verificar las piezas autorizadas y condiciones comerciales antes de publicar campañas.
