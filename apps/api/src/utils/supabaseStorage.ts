// apps/api/src/utils/supabaseStorage.ts
import type { Express } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Mantém totalmente concentrado neste arquivo
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_BUCKET_FOTOS = process.env.SUPABASE_BUCKET_FOTOS || "chamado-fotos";

let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "manutencao-api" } },
  });
} else {
  console.warn(
    "[supabaseStorage] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados; upload de fotos ficará indisponível."
  );
}

/**
 * Faz upload do arquivo para o bucket configurado e retorna o path interno.
 */
export async function uploadChamadoFotoToStorage(
  chamadoId: string,
  file: Express.Multer.File
): Promise<string> {
  if (!supabase) {
    throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
  }

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.originalname || "");
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";

  const fileName = `${chamadoId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET_FOTOS)
    .upload(fileName, file.buffer, {
      cacheControl: "3600",
      contentType: file.mimetype || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return fileName;
}

/**
 * Gera uma signed URL temporária para exibir a foto no front.
 */
export async function getSignedUrlFromStorage(
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (!supabase) {
    throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
  }

  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET_FOTOS)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw error || new Error("FAILED_TO_CREATE_SIGNED_URL");
  }

  return data.signedUrl;
}
