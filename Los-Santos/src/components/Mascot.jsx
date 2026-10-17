import React from "react";

// Ángel y diablito de Los Santos, redibujados en vector a partir de los
// personajes de la marca (contorno grueso, cabeza redonda, cuerpo pequeño).
// Poses: "hola" (saluda), "guino" (guiña y señala), "antojo" (sostiene comida),
// "duerme" (pedidos en pausa), "fiesta" (pedido enviado).
const INK = { devil: "#e10a0a", angel: "#f5c400" };

function Face({ kind, pose }) {
  if (pose === "duerme")
    return (
      <g>
        <path d="M70 92 q10 8 20 0 M110 92 q10 8 20 0" />
        <path d="M90 118 q10 6 20 0" />
        <text x="150" y="40" className="mascot-z" fill="currentColor" stroke="none" fontSize="26" fontWeight="700">
          z
        </text>
        <text x="166" y="22" className="mascot-z mascot-z2" fill="currentColor" stroke="none" fontSize="18" fontWeight="700">
          z
        </text>
      </g>
    );
  if (kind === "devil")
    return (
      <g>
        {/* cejas traviesas */}
        <path d="M64 76 L90 88 M136 76 L110 88" />
        {pose === "guino" ? (
          <path d="M70 96 q11 -8 22 0" />
        ) : (
          <path d="M70 92 q10 -2 20 6 q-4 10 -14 8 q-8 -2 -6 -14z" fill="currentColor" />
        )}
        <path d="M130 92 q-10 -2 -20 6 q4 10 14 8 q8 -2 6 -14z" fill="currentColor" />
        {/* sonrisa de lado */}
        <path d={pose === "fiesta" ? "M78 116 q22 26 44 0 q-22 8 -44 0z" : "M80 118 q22 18 42 -4"} fill={pose === "fiesta" ? "currentColor" : "none"} />
      </g>
    );
  return (
    <g>
      {pose === "guino" ? (
        <path d="M70 94 q10 -8 20 0" />
      ) : (
        <ellipse cx="80" cy="92" rx="7" ry="10" fill="currentColor" />
      )}
      <ellipse cx="120" cy="92" rx="7" ry="10" fill="currentColor" />
      <path d={pose === "fiesta" ? "M76 114 q24 30 48 0 q-24 8 -48 0z" : "M78 116 q22 20 44 0"} fill={pose === "fiesta" ? "currentColor" : "none"} />
      <path d="M62 108 q4 4 8 0 M130 108 q4 4 8 0" strokeWidth="5" opacity="0.5" />
    </g>
  );
}

function Arms({ pose }) {
  // brazo izquierdo (del personaje) relajado; el derecho cambia con la pose
  const left = <path d="M76 168 q-22 14 -26 34" />;
  if (pose === "hola")
    return (
      <g>
        {left}
        <g className="mascot-wave">
          <path d="M126 168 q34 -4 48 -42" />
          <path d="M170 122 q4 -12 12 -8 M174 128 q10 -6 14 2" strokeWidth="6" />
        </g>
      </g>
    );
  if (pose === "guino")
    return (
      <g>
        {left}
        <path d="M124 170 q30 0 44 -8" />
        <path d="M164 156 l12 2" />
      </g>
    );
  if (pose === "antojo")
    return (
      <g>
        <path d="M76 168 q-14 18 2 30" />
        <path d="M124 168 q14 18 -2 30" />
      </g>
    );
  if (pose === "fiesta")
    return (
      <g>
        <path d="M76 166 q-26 -6 -34 -40" />
        <path d="M124 166 q26 -6 34 -40" />
      </g>
    );
  return (
    <g>
      {left}
      <path d="M124 168 q22 14 26 34" />
    </g>
  );
}

export default function Mascot({ kind = "angel", pose = "hola", className = "", tone, fill = "#fff", title }) {
  const color = tone || INK[kind];
  return (
    <svg
      viewBox="0 0 200 250"
      className={`mascot-svg m-${kind} pose-${pose} ${className}`}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      style={{ color }}
      fill="none"
      stroke="currentColor"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "angel" && (
        <g className="mascot-wings">
          <path d="M126 176 q34 -18 52 2 q-8 4 -12 2 q4 10 -8 12 q2 10 -12 8 q-12 -2 -20 -14" fill={fill} />
        </g>
      )}
      {kind === "devil" && (
        <g className="mascot-tail">
          <path d="M112 226 q46 6 52 -26 q2 -12 -6 -18" />
          <path d="M150 176 l12 4 l-2 14 z" fill="currentColor" />
        </g>
      )}
      {/* cuerpo */}
      <path d="M78 150 q-10 40 -4 76 h52 q6 -36 -4 -76" fill={fill} />
      <path d="M92 226 v-18 M108 226 v-18" strokeWidth="6" />
      {kind === "angel" && <path d="M88 176 q12 10 24 0" strokeWidth="6" />}
      <Arms pose={pose} />
      {/* cabeza */}
      <path
        d={
          kind === "devil"
            ? "M100 40 c40 0 64 26 64 62 c0 32 -26 52 -64 52 c-38 0 -64 -20 -64 -52 c0 -36 24 -62 64 -62z"
            : "M100 44 c38 0 62 24 62 58 c0 32 -26 50 -62 50 c-36 0 -62 -18 -62 -50 c0 -34 24 -58 62 -58z"
        }
        fill={fill}
      />
      {kind === "devil" ? (
        <g>
          <path d="M56 58 q-22 -20 -14 -48 q14 22 38 32" fill={fill} />
          <path d="M144 58 q22 -20 14 -48 q-14 22 -38 32" fill={fill} />
        </g>
      ) : (
        <ellipse className="mascot-halo" cx="100" cy="22" rx="44" ry="11" />
      )}
      <Face kind={kind} pose={pose} />
      {pose === "antojo" && (
        <g strokeWidth="6">
          {kind === "devil" ? (
            // elote con chile
            <g>
              <path d="M86 214 l26 -52 q10 -6 8 8 l-24 50 z" fill="#ffd60a" stroke="#b71c1c" />
              <path d="M98 192 l10 4 M104 180 l10 4 M93 204 l9 4" stroke="#e10a0a" />
            </g>
          ) : (
            // vaso de esquites
            <g>
              <path d="M78 186 h44 l-6 30 h-32 z" fill="#fff" stroke="#e10a0a" />
              <path d="M78 186 q22 -18 44 0" fill="#fff4b8" stroke="#e10a0a" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
