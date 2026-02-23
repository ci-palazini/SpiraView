export interface IStorageProvider {
    /**
     * Uploads a file to the storage.
     * @param path Full path/key for the file (e.g., "123/file.jpg")
     * @param file File buffer
     * @param mimeType Mime type of the file
     * @returns The path (key) of the uploaded file
     */
    uploadFile(path: string, file: Buffer, mimeType: string, bucketOverride?: string): Promise<string>;

    /**
     * Returns a permanent public URL for the file (requires public bucket).
     * @param path Full path/key for the file
     */
    getPublicUrl(path: string, bucketOverride?: string): string;

    /**
     * Deletes a file from the storage.
     * @param path Full path/key for the file
     */
    deleteFile(path: string, bucketOverride?: string): Promise<void>;
}
