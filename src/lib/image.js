// Reduce la foto en el teléfono antes de subirla: menos datos móviles y
// un catálogo que carga rápido. Lado mayor 1400 px, WebP o JPEG.
const MAX_SIDE = 1400;
const MAX_BYTES = 3 * 1024 * 1024;

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file) {
  if (!file.type.startsWith("image/"))
    throw Error("Elige un archivo de imagen (JPG, PNG, WebP o foto del teléfono).");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error(
      "Este navegador no puede abrir esa foto. Si es HEIC de iPhone, cámbiala a JPG o usa Safari.",
    );
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  // Recortes con fondo transparente (PNG/WebP): se conservan como PNG para
  // que en el menú se vean completos sobre el fondo de la marca.
  if (/png|webp/.test(file.type)) {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = false;
    for (let i = 3; i < data.length; i += 16) if (data[i] < 250) { transparent = true; break; }
    if (transparent) {
      let png = await toBlob(canvas, "image/png");
      let side = Math.max(canvas.width, canvas.height);
      while (png && png.size > MAX_BYTES && side > 500) {
        side = Math.round(side * 0.8);
        const k = side / Math.max(canvas.width, canvas.height);
        const small = document.createElement("canvas");
        small.width = Math.round(canvas.width * k);
        small.height = Math.round(canvas.height * k);
        small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
        png = await toBlob(small, "image/png");
      }
      if (png && png.size <= MAX_BYTES) return { blob: png, width: canvas.width, height: canvas.height, transparent: true };
    }
  }
  // Fotos normales: fondo blanco y formato ligero.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const fctx = flat.getContext("2d");
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(canvas, 0, 0);
  canvas = flat;
  let blob = await toBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.85);
  for (let q = 0.75; blob && blob.size > MAX_BYTES && q > 0.4; q -= 0.1)
    blob = await toBlob(canvas, "image/jpeg", q);
  if (!blob) throw Error("No se pudo preparar la foto.");
  return { blob, width: canvas.width, height: canvas.height };
}
