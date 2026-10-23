import { Prisma } from './generated/prisma/client'

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

// Дубль уникального поля (email, ключ проекта) превращаем в 409 с понятным текстом
export async function failOnDuplicate<T>(action: Promise<T>, message: string): Promise<T> {
  try {
    return await action
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, message)
    }
    throw error
  }
}
