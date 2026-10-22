export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export const forbidden = (message = 'Недостаточно прав') => new HttpError(403, message)
export const notFound = (message = 'Не найдено') => new HttpError(404, message)
