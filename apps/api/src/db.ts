// src/db.ts
import { Pool, PoolClient } from "pg";
import { env } from "./config/env";

export const pool = new Pool({
  connectionString: env.database.connectionString,
  ssl: env.database.ssl,
  max: env.database.maxConnections,
  idleTimeoutMillis: env.database.idleTimeoutMillis,
  allowExitOnIdle: false,
  application_name: "manutencao-api",
});

// Captura erros inesperados de conexões idle no pool
pool.on("error", (err) => {
  console.error("[POOL ERROR] Unexpected error on idle client:", err.message);
});

// fixa o fuso horário em cada conexão do pool
const TIMEZONE = process.env.DB_TIMEZONE || "America/Sao_Paulo";
pool.on("connect", async (client) => {
  try {
    await client.query('SET TIME ZONE $1', [TIMEZONE]);
  } catch (e) {
    console.error("Failed to SET TIME ZONE on connection:", e);
  }
});

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { }
    throw err;
  } finally {
    client.release();
  }
}
