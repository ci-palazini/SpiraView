export interface IStorageProvider {
    /**
     * Uploads a file to the storage.
     * @param path Full path/key for the file (e.g., "123/file.jpg")
     * @param file File buffer
     * @param mimeType Mime type of the file
     * @returns The path (key) of the uploaded file
     */
    uploadFile(path: string, file: Buffer, mimeType: string): Promise<string>;

    /**
     * Generates a signed URL for reading the file.
     * @param path Full path/key for the file
     * @param expiresInSeconds Expiration time in seconds (default: 3600)
     */
    getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;

    /**
     * Deletes a file from the storage.
     * @param path Full path/key for the file
     */
    deleteFile(path: string): Promise<void>;
}
