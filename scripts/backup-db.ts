import { backupDatabase, defaultBackupDest } from "../src/lib/db/backup";

async function main() {
  const dest = process.argv[2] || defaultBackupDest();
  const out = await backupDatabase(dest);
  console.log(`backed up -> ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
