import { describe, expect, it } from 'vitest'
import { can } from '../src/permissions'

const task = { authorId: 1, assigneeId: 2 }

describe('правила доступа', () => {
  it('MEMBER меняет задачу, где он автор или исполнитель, и не меняет чужую', () => {
    expect(can.editTask({ id: 1, role: 'MEMBER' }, task)).toBe(true)
    expect(can.editTask({ id: 2, role: 'MEMBER' }, task)).toBe(true)
    expect(can.editTask({ id: 3, role: 'MEMBER' }, task)).toBe(false)
  })

  it('ADMIN и MANAGER меняют и удаляют любые задачи', () => {
    for (const role of ['ADMIN', 'MANAGER'] as const) {
      expect(can.editTask({ id: 9, role }, task)).toBe(true)
      expect(can.deleteTask({ id: 9, role })).toBe(true)
    }
  })

  it('MEMBER не удаляет даже свою задачу', () => {
    expect(can.deleteTask({ id: 1, role: 'MEMBER' })).toBe(false)
  })

  it('VIEWER только смотрит', () => {
    const viewer = { id: 1, role: 'VIEWER' } as const
    expect(can.createTask(viewer)).toBe(false)
    expect(can.editTask(viewer, task)).toBe(false)
    expect(can.comment(viewer)).toBe(false)
  })

  it('пользователями управляет только ADMIN', () => {
    expect(can.manageUsers({ id: 1, role: 'ADMIN' })).toBe(true)
    expect(can.manageUsers({ id: 1, role: 'MANAGER' })).toBe(false)
  })
})
