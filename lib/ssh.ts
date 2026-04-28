import { spawn } from "node:child_process";
import { access, constants, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type SshTarget = {
  host: string;
  port: number;
  username: string;
  sshKeyPath: string;
};

export type SshResult =
  | { ok: true; stdout: string; durationMs: number }
  | { ok: false; error: string; stderr?: string; durationMs: number };

const DEFAULT_TIMEOUT_MS = 15_000;

const COMMON_SSH_OPTS = [
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ConnectTimeout=8",
  "-o", "ServerAliveInterval=5",
];

async function ensureKeyExists(keyPath: string): Promise<string | null> {
  try {
    await access(keyPath, constants.R_OK);
    return null;
  } catch {
    return `No se puede leer la clave SSH en ${keyPath}`;
  }
}

function runProcess(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<SshResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({
        ok: false,
        error: `No se pudo ejecutar "${cmd}": ${(e as Error).message}. ¿Está instalado en el servidor?`,
        durationMs: Date.now() - start,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.stdout?.on("data", (b: Buffer) => (stdout += b.toString()));
    proc.stderr?.on("data", (b: Buffer) => (stderr += b.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: err.message,
        stderr: stderr.trim() || undefined,
        durationMs: Date.now() - start,
      });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      if (killed) {
        resolve({
          ok: false,
          error: `Timeout tras ${timeoutMs}ms`,
          stderr: stderr.trim() || undefined,
          durationMs,
        });
        return;
      }
      if (code === 0) {
        resolve({ ok: true, stdout: stdout.trim(), durationMs });
      } else {
        resolve({
          ok: false,
          error: `Código de salida ${code}`,
          stderr: stderr.trim() || stdout.trim() || undefined,
          durationMs,
        });
      }
    });
  });
}

/**
 * Verifica que se puede establecer conexión SSH al target ejecutando un `echo`.
 */
export async function testSshConnection(
  target: SshTarget,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SshResult> {
  const keyErr = await ensureKeyExists(target.sshKeyPath);
  if (keyErr) {
    return { ok: false, error: keyErr, durationMs: 0 };
  }
  const args = [
    ...COMMON_SSH_OPTS,
    "-i", target.sshKeyPath,
    "-p", String(target.port),
    `${target.username}@${target.host}`,
    "echo ok",
  ];
  return runProcess("ssh", args, timeoutMs);
}

/**
 * Garantiza que la carpeta remota existe (mkdir -p).
 */
export async function ensureRemoteDir(
  target: SshTarget,
  remoteDir: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SshResult> {
  const keyErr = await ensureKeyExists(target.sshKeyPath);
  if (keyErr) {
    return { ok: false, error: keyErr, durationMs: 0 };
  }
  const safe = remoteDir.replace(/'/g, "'\\''");
  const args = [
    ...COMMON_SSH_OPTS,
    "-i", target.sshKeyPath,
    "-p", String(target.port),
    `${target.username}@${target.host}`,
    `mkdir -p '${safe}'`,
  ];
  return runProcess("ssh", args, timeoutMs);
}

/**
 * Sube un fichero local al destino vía scp.
 */
export async function scpUpload(
  target: SshTarget,
  localPath: string,
  remotePath: string,
  timeoutMs: number = 5 * 60_000,
): Promise<SshResult> {
  const keyErr = await ensureKeyExists(target.sshKeyPath);
  if (keyErr) {
    return { ok: false, error: keyErr, durationMs: 0 };
  }
  const args = [
    ...COMMON_SSH_OPTS,
    "-i", target.sshKeyPath,
    "-P", String(target.port),
    localPath,
    `${target.username}@${target.host}:${remotePath}`,
  ];
  return runProcess("scp", args, timeoutMs);
}

export async function ensureLocalDir(p: string) {
  await mkdir(dirname(p), { recursive: true });
}

export type RetentionResult =
  | { ok: true; kept: number; deleted: string[]; durationMs: number }
  | { ok: false; error: string; stderr?: string; durationMs: number };

/**
 * Aplica retención en el target: lista los ficheros de remoteDir ordenados por
 * fecha (descendente) y borra los que excedan keep. Implementado con un único
 * comando ssh para no abrir N conexiones.
 */
export async function applyRetention(
  target: SshTarget,
  remoteDir: string,
  keep: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<RetentionResult> {
  if (keep < 1) {
    return {
      ok: false,
      error: "retention debe ser >= 1",
      durationMs: 0,
    };
  }
  const keyErr = await ensureKeyExists(target.sshKeyPath);
  if (keyErr) {
    return { ok: false, error: keyErr, durationMs: 0 };
  }
  const safe = remoteDir.replace(/'/g, "'\\''");
  // Lista por mtime descendente, salta los `keep` primeros, e imprime/borra el resto.
  // -- '${safe}' protege rutas con espacios.
  const remoteCmd = `
    cd '${safe}' 2>/dev/null || exit 0
    ls -t -1 -p 2>/dev/null | grep -v '/$' | tail -n +$((${keep} + 1)) | while read -r f; do
      echo "DEL:$f"
      rm -f -- "$f"
    done
  `.trim();
  const args = [
    ...COMMON_SSH_OPTS,
    "-i", target.sshKeyPath,
    "-p", String(target.port),
    `${target.username}@${target.host}`,
    remoteCmd,
  ];
  const result = await runProcess("ssh", args, timeoutMs);
  if (!result.ok) {
    return result;
  }
  const deleted = result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("DEL:"))
    .map((l) => l.slice(4));
  return {
    ok: true,
    kept: keep,
    deleted,
    durationMs: result.durationMs,
  };
}
