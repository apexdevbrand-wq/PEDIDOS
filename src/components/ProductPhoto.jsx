import React, { useState } from "react";

// Foto del platillo o, si aún no tiene, una tarjeta de marca con su nombre.
export default function ProductPhoto({ product, className = "" }) {
  const [failed, setFailed] = useState(false);
  if (!product.image || failed)
    return (
      <div className={"photo-fallback " + className} role="img" aria-label={product.name}>
        <span className="photo-fallback-halo" aria-hidden="true" />
        <span className="photo-fallback-name">{product.name}</span>
      </div>
    );
  return (
    <img
      className={(className + (/\.png$/i.test(product.image) ? " is-cutout" : "")).trim()}
      loading="lazy"
      decoding="async"
      src={product.image}
      alt={product.name}
      onError={() => setFailed(true)}
    />
  );
}
