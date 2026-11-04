import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { getMigrations } from "better-auth/db/migration";
import { migrationStatements } from "./policy.mjs";

const schema = process.env.DRIP_E2E_SCHEMA;
if (!/^browser_[a-f0-9]{32}$/.test(schema ?? "")) throw new Error("A task-owned browser schema is required.");
const loader = await createServer({ configFile: false, resolve: { alias: { "@": resolve(".") } }, server: { middlewareMode: true, hmr: false } });
let db;
try {
  // Load Drip's actual TypeScript factory through the existing Vite toolchain.
  // The factory's explicit local-target guard runs before any connection.
  const module = await loader.ssrLoadModule("/server/auth.ts");
  db = module.database();
  await db.query(`CREATE SCHEMA ${schema}`);
  if ((await db.query("SELECT current_schema() AS name")).rows[0].name !== schema) throw new Error("The browser fixture is not in its isolated schema.");
  await (await getMigrations(module.authOptions())).runMigrations();
  for (const sql of migrationStatements(readFileSync("scripts/migrate.mjs", "utf8"))) await db.query(sql);
  await (await module.getAuth().$context).checkSchema?.();
  console.log("Isolated local browser schema and actual auth policies verified.");
} finally { await db?.end(); await loader.close(); }
