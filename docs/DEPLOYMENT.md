# Servidor público y HTTPS

Esta entrega incluye configuración; no se contrató un dominio, no se publicó un servidor ni se activó una cuenta de pago. Para que clientes externos compren y reciban push, necesitas una máquina o servicio con almacenamiento persistente, acceso saliente HTTPS y una URL pública HTTPS. No se garantiza costo cero del alojamiento o dominio.

## Opción Docker + Caddy

1. Instala Docker y Docker Compose en un servidor que controles. Usa una única instancia de la app.
2. Apunta el registro DNS de tu dominio a ese servidor y habilita los puertos TCP 80 y 443.
3. Crea `.env` a partir de `.env.example`, con credenciales privadas. Configura `DOMAIN=pedidos.tudominio.com`, `PUBLIC_URL=https://pedidos.tudominio.com` y un contacto real en `VAPID_SUBJECT`. No dejes contraseñas de ejemplo.
4. Ejecuta `docker compose up -d --build`. Caddy gestiona certificados y redirige HTTP a HTTPS. El proxy permite el flujo SSE sin esperar a completar la respuesta.
5. Comprueba catálogo, acceso del dueño, compra en efectivo, cambios de cocina y habilitación push desde un teléfono real. Solo después configura y valida Mercado Pago en sandbox.

Los volúmenes `pedidos_data` y `caddy_data` deben conservarse entre actualizaciones. Los respaldos de la app están dentro de `pedidos_data`. Descarga copias fuera del servidor. No uses `docker compose down -v` para actualizar: eliminaría los volúmenes.

No se ha ejecutado el despliegue ni se han comprobado DNS/certificados en esta sesión. Docker/Caddy requiere una URL y máquina reales del negocio. El servidor solo expone públicamente el proxy; el puerto interno de la app no está publicado.

## Sin Docker

Desde un host Node.js 24 con `.env` configurado ejecuta `npm ci`, `npm run build` y `npm start`. Coloca un proxy HTTPS delante del puerto configurado y conserva la cabecera Host original; las mutaciones privadas verifican Origin. Usa un gestor de procesos para reiniciar la app al arrancar el sistema. En producción las cookies Secure requieren HTTPS: para revisar en localhost usa `npm run demo`.

## Red para push y pagos

Permite HTTPS saliente al registro de paquetes durante instalación, `api.mercadopago.com` para pagos y los proveedores que aparezcan en las suscripciones: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`. El servidor rechaza endpoints arbitrarios para evitar usarlo como proxy hacia otras redes. Las fotos iniciales se sirven desde archivos locales.

Para push real prueba al menos: permiso aceptado/rechazado, Android, iPhone instalado en Inicio, app cerrada, conexión temporalmente interrumpida y suscripción expirada. La cola conserva hasta tres intentos y no bloquea cambios de pedido. No se garantizan entrega inmediata ni soporte uniforme de todos los navegadores.

## Actualizar de forma segura

Detén la instancia, descarga un respaldo a otro equipo y conserva `.env`, datos e imágenes propias. Actualiza código, instala con lockfile, ejecuta pruebas/build y reinicia. La migración genera un respaldo previo. Si necesitas restaurar, detén todas las instancias y usa el script de restauración desde la carpeta donde está `data/`.
