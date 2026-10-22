// Все правила доступа в одном месте. Роуты спрашивают здесь, можно ли действие.
import type { Role } from './generated/prisma/enums'

export type Actor = { id: number; role: Role }
type TaskRef = { authorId: number; assigneeId: number | null }

const isStaff = (actor: Actor) => actor.role === 'ADMIN' || actor.role === 'MANAGER'

// «Своя» задача: пользователь её автор или исполнитель
export const isOwnTask = (actor: Actor, task: TaskRef) =>
  task.authorId === actor.id || task.assigneeId === actor.id

export const can = {
  createTask: (actor: Actor) => actor.role !== 'VIEWER',
  // ADMIN и MANAGER меняют любые задачи, MEMBER только свои
  editTask: (actor: Actor, task: TaskRef) =>
    isStaff(actor) || (actor.role === 'MEMBER' && isOwnTask(actor, task)),
  deleteTask: (actor: Actor) => isStaff(actor),
  comment: (actor: Actor) => actor.role !== 'VIEWER',
  deleteComment: (actor: Actor, comment: { authorId: number }) =>
    isStaff(actor) || comment.authorId === actor.id,
  manageProjects: (actor: Actor) => isStaff(actor),
  manageUsers: (actor: Actor) => actor.role === 'ADMIN',
}
