// Как задачи и комментарии выглядят в ответах API
import type { Prisma } from './generated/prisma/client'

export const userSelect = { id: true, name: true, email: true, role: true } as const

export const taskInclude = {
  project: { select: { id: true, key: true, name: true } },
  author: { select: userSelect },
  assignee: { select: userSelect },
  _count: { select: { comments: true } },
} as const

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

export function serializeTask(task: TaskWithRelations) {
  const { _count, ...rest } = task
  return { ...rest, key: `${task.project.key}-${task.number}`, commentCount: _count.comments }
}
