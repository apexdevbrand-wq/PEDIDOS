# Pruebas antes de usar la app como herramienta principal

Lo automatizable ya está cubierto por `npm test` (39 pruebas) y `scripts/stress.js`. Esta lista es lo que **solo se puede comprobar con el servidor publicado, teléfonos reales, dinero real e impresoras reales**. Marca cada punto en orden.

## 1. Mercado Pago

La integración ya se probó contra un simulador de la API (`tests/mercadopago-flow.test.js`): preferencia con recargo del 4 %, webhook firmado, rechazo de firmas falsas o viejas, rechazo de importes distintos, consulta manual y reembolsos. Falta confirmarlo con tu cuenta.

**Con credenciales de prueba (sandbox):**

1. En mercadopago.com.mx/developers → **Tus integraciones → Crear aplicación** (Checkout Pro).
2. En **Cuentas de prueba** crea un usuario *vendedor* y uno *comprador*. Inicia sesión como vendedor de prueba y copia su **Access Token de producción** (en cuentas de prueba ese token ya es de prueba).
3. En **Webhooks** configura la URL `https://TU-DOMINIO/api/payments/webhook`, evento **Pagos**, y copia la **clave secreta**.
4. En `.env`: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PUBLIC_URL` (https). Reinicia.
5. Haz un pedido con Mercado Pago desde otro navegador e inicia sesión con el comprador de prueba. Usa las tarjetas de prueba de México de la documentación de Mercado Pago, con titular **APRO** (aprobado) y luego **OTHE** (rechazado).

Comprueba:

- [ ] Aprobado: en Cocina el pedido pasa de “Esperando confirmación” a cobrado sin recargar, y el cliente lo ve pagado.
- [ ] Rechazado: el pedido sigue “por cobrar” y Cocina no puede aceptarlo.
- [ ] Si el aviso tarda, **Consultar pago ahora** en la tarjeta del pedido lo actualiza.
- [ ] Reembolso desde el panel de Mercado Pago: en Ventas y caja aparece como devolución en la fecha del reembolso.
- [ ] La preferencia vence a los 30 minutos (un enlace viejo ya no cobra).

**En producción:** cambia a las credenciales reales del negocio y haz un pedido real de monto bajo pagado con tu propia tarjeta. Reembólsalo desde Mercado Pago y confirma el corte.

## 2. Avisos push en teléfonos (requiere HTTPS)

- [ ] Android + Chrome: hacer pedido → **Activar avisos del pedido** → aceptar permiso. Cerrar Chrome. Aceptar el pedido en Cocina: llega el aviso con la hora estimada.
- [ ] iPhone (iOS 16.4+): abrir en Safari → Compartir → **Añadir a pantalla de inicio**, abrir desde el icono, activar avisos. Repetir la prueba.
- [ ] Rechazar un pedido con motivo: el aviso muestra el motivo.
- [ ] Permiso denegado: la app explica cómo cambiarlo y no se rompe.
- [ ] Teléfono sin internet unos minutos: al volver llega el aviso pendiente (hasta 3 intentos).

## 3. Impresoras de tickets (80 mm)

Los tickets y comandas se imprimen con el diálogo del navegador. En la tableta o PC de cocina:

- [ ] Instala el controlador de la impresora térmica y ponla como predeterminada.
- [ ] En el diálogo: tamaño de papel 80 mm (o 72 mm imprimible), **márgenes: ninguno**, escala 100 %, sin encabezados ni pies de página. Chrome recuerda la configuración.
- [ ] Imprime **Comanda** y **Ticket** de un pedido con notas largas, extras y dirección: nada se corta.
- [ ] Permite ventanas emergentes para el sitio (si no, la app lo indica).
- [ ] Opcional: en una PC con Chrome, el acceso directo con `--kiosk-printing` imprime sin mostrar el diálogo.

## 4. Pedidos simultáneos y reconexiones

Contra una **copia de prueba** (nunca la base real, crea pedidos de verdad):

```bash
node scripts/stress.js --base https://copia-de-prueba --user cocina --pass "..." --orders 300 --concurrency 50 --sse 60
```

Resultado en esta entrega (servidor local, 300 pedidos, 360 solicitudes con dobles envíos, 60 pantallas en tiempo real): todo correcto; p50 137 ms, p95 360 ms con 50 solicitudes a la vez; ningún folio duplicado; dos tabletas aceptando el mismo pedido → solo una gana y la otra recibe aviso.

En el local, con el servidor publicado:

- [ ] Dos tabletas en Cocina: aceptar el mismo pedido a la vez → una lo acepta y la otra ve el aviso.
- [ ] Apagar el Wi-Fi de una tableta 1 minuto: aparece “Reconectando…”; al volver se pone “En vivo” y muestra los pedidos que llegaron.
- [ ] Reiniciar el servidor (`docker compose restart app`) en hora tranquila: las pantallas se reconectan solas; el personal vuelve a iniciar sesión (las sesiones duran 8 h y no sobreviven reinicios).
- [ ] Un cliente pulsa “Enviar pedido” varias veces con mala señal: solo existe un pedido.

## 5. Tiempo de entrega y alarma de cocina

- [ ] En **Envíos**, ajusta los minutos de cada colonia con tiempos reales del repartidor (cronometra 2 o 3 entregas por colonia).
- [ ] Pedido a domicilio: el cliente ve los minutos al elegir colonia, la hora aproximada al aceptarse y la hora corregida al pulsar “Salió a entregar”.
- [ ] Cocina: con la alarma activada, un pedido nuevo suena en bucle; “Silenciar” lo calla y vuelve a sonar a los 90 s si nadie lo acepta.
- [ ] App Android (si la usas): sigue [ANDROID.md](ANDROID.md) → “Instalar en la tablet de cocina”.

## 6. Antes de abrir al público

- [ ] Cambia los precios y fotos de ejemplo desde **Administración → Catálogo** (los precios de Promos son los publicados en Facebook; el resto son de ejemplo).
- [ ] Revisa colonias y costos de envío en **Envíos**.
- [ ] Configura el horario real y activa “Aplicar horario semanal”.
- [ ] Crea una cuenta por empleado en **Equipo**; borra contraseñas iniciales del `.env`.
- [ ] Configura respaldos fuera del servidor y comprueba “Última copia correcta”.
- [ ] Configura el monitor de UptimeRobot.
- [ ] Haz un respaldo manual y practica restaurarlo en tu computadora una vez.
