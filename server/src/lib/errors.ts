export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = 'No autenticado') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'No tienes permisos para esta acción') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Recurso no encontrado') => new AppError(404, 'NOT_FOUND', msg);
export const badRequest = (code: string, msg: string) => new AppError(400, code, msg);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
export const unprocessable = (code: string, msg: string) => new AppError(422, code, msg);
