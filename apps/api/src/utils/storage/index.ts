import { SupabaseStorageProvider } from "./SupabaseStorageProvider";
import type { IStorageProvider } from "./IStorageProvider";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET_FOTOS = process.env.SUPABASE_BUCKET_FOTOS || "chamado-fotos";

export const storageProvider: IStorageProvider = new SupabaseStorageProvider(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_BUCKET_FOTOS
);

export * from "./IStorageProvider";
export * from "./StorageError";
