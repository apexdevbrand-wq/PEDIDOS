import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv, promisify } from "node:util";
import { fileURLToPath } from "node:url";
test(
  "asistente guarda la contraseña literalmente y no sobrescribe .env existente",
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "santos-config-")),
      script = fileURLToPath(
        new URL("../scripts/configure.js", import.meta.url),
      ),
      password = 'Uno#Dos\\Tres"Cuatro2026!';
    try {
      const proc = spawn(process.execPath, [script], {
        cwd: dir,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "",
        step = 0;
      const prompts = [
          "Usuario del dueño",
          "Contraseña del dueño",
          "Repite la contraseña",
        ],
        answers = ["dueno", password, password];
      proc.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (step < 3 && output.includes(prompts[step])) {
          const value = answers[step++];
          proc.stdin.write(value + "\n");
        }
      });
      proc.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      const code = await new Promise((r) => proc.once("close", r));
      assert.equal(code, 0, output);
      const text = await readFile(join(dir, ".env"), "utf8");
      assert.equal(parseEnv(text).OWNER_PASSWORD, password);
      await assert.rejects(
        () => promisify(execFile)(process.execPath, [script], { cwd: dir }),
        (e) => /No se sobrescribió/.test(e.stderr),
      );
      assert.equal(await readFile(join(dir, ".env"), "utf8"), text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
