# Los Santos · Gestión de pedidos

Base full stack para un negocio gastronómico local, con exactamente tres vistas: **cliente**, **cocina** y **administración**. React 19, Tailwind CSS 4, Vite 6, Express 5 y SQLite nativo de Node 24. Interfaz en español, MXN y diseño adaptable a móvil, tablet y escritorio.

## Descargar y ver los demos

- [Proyecto completo en ZIP](entregables/Los-Santos-proyecto.zip): en GitHub, usa el botón de descarga del archivo.
- [Demos visuales en ZIP](entregables/Los-Santos-demos.zip): descomprime y abre `demos/index.html`.
- Capturas: [Cliente](entregables/demos/01-cliente.png), [Checkout](entregables/demos/02-checkout.png), [Cocina](entregables/demos/03-cocina.png), [Administración](entregables/demos/04-administracion.png), [Móvil](entregables/demos/05-movil.png).

La galería es visual; para interactuar con los pedidos ejecuta la aplicación como se indica abajo.

## Iniciar

Requiere Node.js 24 (ver `.nvmrc`). Desde la raíz del repositorio:

```bash
npm ci
npm run dev
```

Para revisar la app con menos carga que el modo desarrollo:

```bash
npm run build
npm run demo
```

`demo` sirve archivos compilados sin Vite, vigilancia de archivos ni HMR. Se vincula únicamente a la interfaz de loopback y mantiene el aviso de demo y el acceso abierto de personal. Detén cualquier servidor anterior del proyecto antes de arrancarlo. No uses el modo demo para operar públicamente.

El servidor atiende en el puerto 3000. `PORT` permite cambiarlo. En desarrollo, sin `STAFF_TOKEN`, la aplicación muestra explícitamente un modo demo con acceso de personal abierto. Los productos, precios y colonias iniciales son ejemplos editables.

```bash
npm test
npm run build
npm start
```

`npm start` usa la compilación de producción y **bloquea** los endpoints de personal si falta `STAFF_TOKEN`. Para cargar variables locales, copia `.env.example` a `.env`, completa los valores y ejecuta `NODE_ENV=production node --env-file=.env server/index.js`. Nunca subas `.env` a Git. El token se introduce en la vista de cocina o administración y se conserva en `sessionStorage`.

## Funciones

- Cliente: catálogo por categoría, notas y cantidades, recogida gratuita o envío por colonia, checkout con teléfono y dirección condicional, folio y seguimiento del último pedido en este dispositivo.
- Cálculo en centavos: `subtotal + envío + redondear((subtotal + envío) × 0.04)` solo para Mercado Pago. El servidor obtiene precios y disponibilidad de su base; ignora precios enviados por el cliente.
- Cocina: tarjetas cronológicas, datos de entrega y desglose, aceptar/preparar, listo/en camino, entregar/cobrar o rechazar. Las transiciones inválidas se rechazan en el servidor. Los pedidos digitales sin pago confirmado no se pueden preparar.
- Administración: crear, renombrar, editar tarifa y desactivar colonias; editar precios y disponibilidad; cobros diarios por método, envíos cobrados y pedidos diarios por colonia. Las colonias se desactivan en lugar de borrarse para conservar historia.
- SQLite conserva pedidos, líneas y precios históricos; SSE comunica cambios entre navegadores conectados. El cliente actualiza su seguimiento sin recargar.
- Manifest, icono y service worker como base PWA. Requiere HTTPS para instalación fuera de desarrollo. Los pedidos **requieren conexión**; no se cachean API ni datos personales, ni se encolan compras sin conexión.

## Mercado Pago: conexión pendiente

El adaptador de Checkout Pro está en `server/payments.js`. Se activa únicamente con `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `PUBLIC_URL` HTTPS. Sin ellos, la UI permite ver el desglose del 4%, pero deshabilita confirmar pagos digitales. No simula cobros exitosos.

1. Configura credenciales de **prueba** y la URL pública HTTPS.
2. Registra notificaciones de pagos para `PUBLIC_URL/api/payments/webhook` y su secreto de firma.
3. La aplicación crea una preferencia con el total calculado por el servidor y redirige al checkout alojado.
4. El retorno del navegador no confirma el pago. El webhook valida HMAC, consulta el pago con la API de Mercado Pago y compara referencia, ID, moneda e importe antes de marcarlo pagado.
5. Prueba pagos aprobados, pendientes, rechazados y reembolsados en sandbox antes de usar credenciales productivas.

La integración externa no se ha ejecutado contra una cuenta real: faltan credenciales y URL pública. Los reembolsos y cupones se tramitan manualmente; rechazar un pedido pagado muestra una advertencia, no ejecuta automáticamente un reembolso. Si falla la creación de preferencia, se conserva el pedido pendiente para trazabilidad: no prepares pedidos digitales sin confirmar y contacta al cliente. Falta un flujo de reintento y conciliación programada de pagos para producción.

## Datos y operación

`data/orders.sqlite` se crea automáticamente y está ignorado por Git. Ejecuta una sola instancia de Node por archivo SQLite: esta base mantiene el catálogo en memoria y persiste cambios en transacciones. Usa volumen persistente, respaldo consistente mediante SQLite Backup API y permisos restrictivos. No copies el archivo sin contemplar WAL mientras hay escrituras. No incluye eliminación automática de datos personales.

Las métricas muestran importes cobrados de pedidos **creados hoy**, en `America/Mexico_City`; no son un libro contable ni incluyen pedidos pendientes. Los precios e importes históricos no cambian al editar el menú. Ver [arquitectura y contrato de datos](docs/ARCHITECTURE.md) y [recursos visuales](docs/ASSETS.md).

## Límites antes de operar públicamente

Esta es una base funcional de desarrollo. El acceso compartido de personal no distingue roles: cocina y dueño comparten autorización. Antes de producción añade usuarios y roles, sesiones revocables, límites de solicitudes, protección contra abuso y pedidos duplicados, registro de auditoría, aviso de privacidad y política de retención, conciliación de pagos y monitoreo. Las notificaciones son actualizaciones dentro de la aplicación conectada; no se envían WhatsApp, SMS ni push al repartidor. El seguimiento usa un UUID como enlace secreto: no lo compartas ni lo registres en analítica pública.

Sustituye el menú, tarifas, fotografías de referencia e identidad tipográfica por los recursos reales del negocio. La referencia de marca se interpretó en rojo, crema, blanco y amarillo; no se dispone del archivo oficial del logotipo en el repositorio.
