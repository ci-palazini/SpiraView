import 'express-serve-static-core';

declare global {
  namespace Express {
    interface UserPayload {
      id?: string;
      email?: string;
      nome?: string | null;
      name?: string | null;
      role?: string;
      locale?: string;
      [k: string]: unknown;
    }
    interface Request {
      user?: UserPayload;
    }
  }
}
export { };
