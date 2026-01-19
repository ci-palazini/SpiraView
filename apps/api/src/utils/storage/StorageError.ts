export class StorageError extends Error {
    constructor(message: string, public readonly originalError?: any) {
        super(message);
        this.name = "StorageError";
    }
}
