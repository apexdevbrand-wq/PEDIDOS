# Recursos visuales

- `public/brand/logo.png`, `logo-white.png`, `angel.png`, `devil.png`, `devil-white.png`: logotipo y personajes de la marca en alta resolución con fondo transparente (de la versión 2).
- `public/images/products/*.png`: recortes sin fondo de los productos reales (hamburguesas, tostilocos, elotes, esquites, mojito, café). Se muestran completos sobre el rojo de la marca.
- `public/sounds/pedido.wav`: sonido de la alarma de Cocina en el navegador. La app Android usa `android-app/.../res/raw/alarma.wav`.
- `burger-especial.jpg`, `alitas.jpg`, `boneless.jpg`, `drink-santos.jpg`, `promo-*.jpg`: recortes del mismo cartel del negocio. Su resolución es limitada (el cartel original mide 960 × 527); sustitúyelos por fotos propias desde Administración → Catálogo.
- `food-1.jpg`, `food-2.jpg` y `food-5.jpg`: fotografías ilustrativas de Unsplash (fuentes en `sources.json`); `food-3`, `food-4` y `food-6` ya no se usan en el menú inicial.
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.png`: iconos con el ángel de la marca.
- Productos sin foto muestran una tarjeta roja con halo y el nombre del platillo (no un hueco gris).
- Tipografías incluidas en el paquete (sin peticiones externas): Anton (títulos y precios) y Rubik (texto), ambas con licencia SIL Open Font License.

Las fotos que se suben desde el panel se guardan en `data/uploads/` con nombre aleatorio, se sirven desde `/uploads/` y se copian a los respaldos externos si están configurados.

## Versión 0.5

- `src/components/Mascot.jsx`: ángel y diablito redibujados en SVG a partir de los personajes de la marca, con poses `hola`, `guino`, `antojo`, `duerme` y `fiesta`. Cambian de color con `tone` y `fill` y se animan solo si el dispositivo no pide reducir movimiento.
- `public/images/products/miche.png`, `mojito-limon.png`, `kittychela.png`, `elote-espolvoreado.png`: recortes sin fondo tomados de la carta impresa. `public/images/aguachile.jpg` y `vaso-botanero.jpg` son fragmentos de la misma carta. Su resolución es baja (vienen de una imagen de 1280 px): sirven para miniaturas; sustitúyelas por fotos propias cuando las tengas.
- Tipografía adicional: DM Serif Display (cursiva para “antoja” y los listones), licencia SIL Open Font License.
