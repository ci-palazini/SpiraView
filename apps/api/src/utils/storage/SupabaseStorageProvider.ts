import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IStorageProvider } from "./IStorageProvider";
import { StorageError } from "./StorageError";
import { logger } from "../../logger";

export class SupabaseStorageProvider implements IStorageProvider {
    private supabase: SupabaseClient | null = null;
    private bucket: string;
    private url: string;

    constructor(
        url: string | undefined,
        key: string | undefined,
        bucket: string
    ) {
        this.bucket = bucket;
        this.url = url || "";

        if (url && key) {
            this.supabase = createClient(url, key, {
                auth: { persistSession: false },
                global: { headers: { "X-Client-Info": "manutencao-api" } },
            });
        } else {
            logger.warn("[SupabaseStorageProvider] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY not configured. Storage will fail.");
        }
    }

    private getClient(): SupabaseClient {
        if (!this.supabase) {
            throw new StorageError("SUPABASE_STORAGE_NOT_CONFIGURED");
        }
        return this.supabase;
    }

    async uploadFile(path: string, file: Buffer, mimeType: string, bucketOverride?: string): Promise<string> {
        const { error } = await this.getClient().storage
            .from(bucketOverride || this.bucket)
            .upload(path, file, {
                cacheControl: "3600",
                contentType: mimeType || "application/octet-stream",
                upsert: false,
            });

        if (error) {
            logger.error({ err: error, path }, "[Storage] Upload failed");
            throw new StorageError("UPLOAD_FAILED", error);
        }

        return path;
    }

    getPublicUrl(path: string, bucketOverride?: string): string {
        return `${this.url}/storage/v1/object/public/${bucketOverride || this.bucket}/${path}`;
    }

    async getSignedUrl(path: string, expiresInSeconds = 3600, bucketOverride?: string): Promise<string> {
        const { data, error } = await this.getClient().storage
            .from(bucketOverride || this.bucket)
            .createSignedUrl(path, expiresInSeconds);

        if (error || !data?.signedUrl) {
            logger.error({ err: error, path }, "[Storage] GetSignedUrl failed");
            throw new StorageError("FAILED_TO_CREATE_SIGNED_URL", error);
        }

        return data.signedUrl;
    }

    async deleteFile(path: string, bucketOverride?: string): Promise<void> {
        const { error } = await this.getClient().storage
            .from(bucketOverride || this.bucket)
            .remove([path]);

        if (error) {
            logger.error({ err: error, path }, "[Storage] Delete failed");
            throw new StorageError("DELETE_FAILED", error);
        }

        logger.info({ path }, "[Storage] Deleted file");
    }
}
