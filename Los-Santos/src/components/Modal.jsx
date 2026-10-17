import React, { useEffect, useRef } from "react";
export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="app-dialog"
      aria-label={title}
      onCancel={onClose}
    >
      <div className="line">
        <h2>{title}</h2>
        <button
          className="close-dialog"
          onClick={onClose}
          aria-label="Cerrar ventana"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
