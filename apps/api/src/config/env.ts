import dotenv from "dotenv";
import { z } from "zod";

let dotenvLoaded = false;

type DeepReadonly<T> = {
  readonly [Key in keyof T]: DeepReadonly<T[Key]>;
};

type ReadonlyEnv = DeepReadonly<Env>;
let cachedEnv: ReadonlyEnv | null = null;

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65_535).default(3_000),
    CORS_ORIGINS: z.string().optional(),
    DATABASE_URL: z.string().min(1).optional(),
    PG_URL: z.string().min(1).optional(),
    PGHOST: z.string().min(1).optional(),
    PGPORT: z.coerce.number().int().positive().max(65_535).optional(),
    PGUSER: z.string().optional(),
    PGPASSWORD: z.string().optional(),
    PGDATABASE: z.string().optional(),
    PGSSLMODE: z.string().optional(),
    PGSSL: z.string().optional(),
    PGPOOL_MAX: z.coerce.number().int().positive().optional(),
    PGPOOL_IDLE_TIMEOUT: z.coerce.number().int().nonnegative().optional(),
    AUTH_STRICT: z.string().optional(),
    AUTOMATION_API_TOKEN: z.string().optional(),
    JWT_SECRET: z.string().min(1),
  })
  .transform(v => ({ ...v, PGPOOL_IDLE_TIMEOUT: v.PGPOOL_IDLE_TIMEOUT ?? 30_000 }));

type RawEnv = z.infer<typeof rawEnvSchema>;

export type Env = {
  nodeEnv: RawEnv["NODE_ENV"];
  server: { port: number };
  cors: { allowedOrigins: readonly string[] };
  database: {
    connectionString: string;
    ssl?: { rejectUnauthorized: false };
    maxConnections: number;
    idleTimeoutMillis: number;
  };
  auth: { strict: boolean; jwtSecret: string };
  automation: { apiToken: string | undefined };
};

function ensureDotenvLoaded(): void {
  if (!dotenvLoaded) {
    dotenv.config();
    dotenvLoaded = true;
  }
}

function formatZodErrors(error: z.ZodError): string {
  return error.errors
    .map(issue => {
      const path = issue.path.join(".") || "<root>";
      return `  • ${path}: ${issue.message}`;
    })
    .join("\n");
}

function parseRawEnv(overrides?: Partial<NodeJS.ProcessEnv>): RawEnv {
  ensureDotenvLoaded();

  const result = rawEnvSchema.safeParse({
    ...process.env,
    ...overrides,
  });

  if (!result.success) {
    const formatted = formatZodErrors(result.error);
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }

  return result.data;
}

function resolveConnectionString(raw: RawEnv): string {
  if (raw.PGHOST || raw.PGUSER || raw.PGPASSWORD || raw.PGDATABASE || raw.PGPORT) {
    const host = raw.PGHOST ?? "localhost";
    const port = raw.PGPORT ?? 5_432;
    const user = encodeURIComponent(raw.PGUSER ?? "postgres");
    const password = encodeURIComponent(raw.PGPASSWORD ?? "");
    const database = encodeURIComponent(raw.PGDATABASE ?? "postgres");

    return `postgres://${user}:${password}@${host}:${port}/${database}`;
  }

  return raw.DATABASE_URL ?? raw.PG_URL ?? "postgres://postgres:@localhost:5432/postgres";
}

function shouldUseSsl(raw: RawEnv, connectionString: string): boolean {
  const explicit = (raw.PGSSLMODE ?? raw.PGSSL ?? "").trim().toLowerCase();

  if (["require", "true", "1"].includes(explicit)) return true;
  if (["disable", "false", "0"].includes(explicit)) return false;

  return (
    /(^|[?&])sslmode=require/i.test(connectionString) ||
    /neon|supabase|render|heroku/i.test(connectionString)
  );
}

function parseCorsOrigins(rawOrigins: string | undefined): string[] {
  return (rawOrigins ?? "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);
}

function parseBoolean(input: string | undefined, defaultValue: boolean): boolean {
  if (input === undefined) return defaultValue;

  const normalized = input.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return defaultValue;
}

function toEnv(raw: RawEnv): Env {
  const connectionString = resolveConnectionString(raw);
  const env: Env = {
    nodeEnv: raw.NODE_ENV,
    server: { port: raw.PORT },
    cors: { allowedOrigins: parseCorsOrigins(raw.CORS_ORIGINS) },
    database: {
      connectionString,
      ssl: shouldUseSsl(raw, connectionString) ? { rejectUnauthorized: false } : undefined,
      maxConnections: raw.PGPOOL_MAX ?? 10,
      idleTimeoutMillis: raw.PGPOOL_IDLE_TIMEOUT,
    },
    auth: {
      strict: parseBoolean(raw.AUTH_STRICT, true),
      jwtSecret: raw.JWT_SECRET,
    },
    automation: { apiToken: raw.AUTOMATION_API_TOKEN },
  };

  return env;
}

function freezeEnv(env: Env): DeepReadonly<Env> {
  return Object.freeze({
    ...env,
    server: Object.freeze({ ...env.server }),
    cors: Object.freeze({ ...env.cors, allowedOrigins: Object.freeze([...env.cors.allowedOrigins]) }),
    database: Object.freeze({ ...env.database }),
    auth: Object.freeze({ ...env.auth }),
  });
}

export function loadEnv(overrides?: Partial<NodeJS.ProcessEnv>): ReadonlyEnv {
  if (!overrides && cachedEnv) {
    return cachedEnv;
  }

  const env = toEnv(parseRawEnv(overrides));
  if (overrides) return freezeEnv(env);

  cachedEnv = freezeEnv(env);
  return cachedEnv;
}

export const env = loadEnv();
