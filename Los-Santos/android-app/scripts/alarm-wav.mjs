// Genera res/raw/alarma.wav: tres pitidos alternos 880/1320 Hz y una pausa (1 s, se repite en bucle).
import { writeFileSync } from "node:fs";
const rate = 22050,
  parts = [];
const tone = (hz, ms) => {
  const n = Math.round((rate * ms) / 1000);
  return Array.from({ length: n }, (_, i) => {
    const fade = Math.min(1, i / 200, (n - i) / 200);
    return Math.sin((2 * Math.PI * hz * i) / rate) * 0.9 * fade;
  });
};
for (let i = 0; i < 3; i++) parts.push(...tone(880, 120), ...tone(1320, 120));
parts.push(...new Array(Math.round(rate * 0.28)).fill(0));
const data = Buffer.alloc(parts.length * 2);
parts.forEach((v, i) => data.writeInt16LE(Math.round(v * 32767), i * 2));
const head = Buffer.alloc(44);
head.write("RIFF", 0);
head.writeUInt32LE(36 + data.length, 4);
head.write("WAVEfmt ", 8);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(1, 22);
head.writeUInt32LE(rate, 24);
head.writeUInt32LE(rate * 2, 28);
head.writeUInt16LE(2, 32);
head.writeUInt16LE(16, 34);
head.write("data", 36);
head.writeUInt32LE(data.length, 40);
writeFileSync(process.argv[2], Buffer.concat([head, data]));
