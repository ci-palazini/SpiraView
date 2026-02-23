// src/db.ts
import { Pool, PoolClient } from "pg";
import { env } from "./config/env";
import { logger } from "./logger";

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
  logger.error({ err }, "[POOL ERROR] Unexpected error on idle client");
});

// fixa o fuso horário em cada conexão do pool
const TIMEZONE = process.env.DB_TIMEZONE || "America/Sao_Paulo";
pool.on("connect", async (client) => {
  try {
    await client.query("SELECT set_config('timezone', $1, false)", [TIMEZONE]);
  } catch (e) {
    logger.error({ err: e }, "Failed to SET TIME ZONE on connection");
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
