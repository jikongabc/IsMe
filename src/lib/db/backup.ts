import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

function resolveDbPath(): string {
  const raw = process.env.ISME_DATABASE_PATH ?? "./data/isme.db";
  if (path.isAbsolute(raw)) return raw;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), raw);
}

/**
 * Consistent SQLite snapshot (safe with WAL). Uses the native backup API
 * instead of copying the main file + sidecars.
 */
export async function backupDatabase(destPath: string): Promise<string> {
  const srcPath = resolveDbPath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ srcPath)) {
    throw new Error(`database not found: ${srcPath}`);
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

  const db = new Database(srcPath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destPath);
  } finally {
    db.close();
  }
  return destPath;
}

export function defaultBackupDest(stamp = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = [
    stamp.getFullYear(),
    pad(stamp.getMonth() + 1),
    pad(stamp.getDate()),
    "-",
    pad(stamp.getHours()),
    pad(stamp.getMinutes()),
    pad(stamp.getSeconds()),
  ].join("");
  const dir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), "backups");
  return path.join(dir, `isme-${label}.db`);
}
