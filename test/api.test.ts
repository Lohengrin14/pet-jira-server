import { beforeEach, describe, expect, it } from 'vitest'
import { setupTestApp } from './helpers'

let ctx: Awaited<ReturnType<typeof setupTestApp>>

beforeEach(async () => {
  ctx = await setupTestApp()
})

async function createTask(who: 'admin' | 'manager' | 'member' | 'other', extra: object = {}) {
  const res = await ctx.as(who).request('POST', '/tasks', { projectId: ctx.project.id, title: 'Задача', ...extra })
  expect(res.statusCode).toBe(201)
  return res.json()
}

describe('вход', () => {
  it('dev-login выдаёт токен, /me возвращает пользователя', async () => {
    const login = await ctx.app.inject({ method: 'POST', url: '/auth/dev-login', payload: { userId: ctx.users.member.id } })
    expect(login.statusCode).toBe(200)
    const me = await ctx.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${login.json().token}` } })
    expect(me.json()).toMatchObject({ name: 'member', role: 'MEMBER' })
  })

  it('без токена задачи не отдаются', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/tasks' })
    expect(res.statusCode).toBe(401)
  })
})

describe('задачи', () => {
  it('создание: ключ, приоритет по умолчанию, автор', async () => {
    const first = await createTask('member')
    const second = await createTask('member', { priority: 'HIGH', assigneeId: ctx.users.other.id })
    expect(first).toMatchObject({ key: 'PJ1-1', priority: 'MEDIUM', status: 'TODO', author: { name: 'member' } })
    expect(second).toMatchObject({ key: 'PJ1-2', priority: 'HIGH', assignee: { name: 'other' } })
  })

  it('пустое название и неизвестный статус отклоняются', async () => {
    const empty = await ctx.as('member').request('POST', '/tasks', { projectId: ctx.project.id, title: '  ' })
    expect(empty.statusCode).toBe(400)
    const task = await createTask('member')
    const bad = await ctx.as('member').request('PATCH', `/tasks/${task.id}`, { status: 'LATER' })
    expect(bad.statusCode).toBe(400)
  })

  it('VIEWER не создаёт задачи', async () => {
    const res = await ctx.as('viewer').request('POST', '/tasks', { projectId: ctx.project.id, title: 'x' })
    expect(res.statusCode).toBe(403)
  })

  it('MEMBER двигает свою задачу и задачу, где он исполнитель', async () => {
    const own = await createTask('member')
    const assigned = await createTask('manager', { assigneeId: ctx.users.member.id })
    for (const t of [own, assigned]) {
      const res = await ctx.as('member').request('PATCH', `/tasks/${t.id}`, { status: 'IN_PROGRESS' })
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('IN_PROGRESS')
    }
  })

  it('MEMBER не двигает чужую задачу', async () => {
    const task = await createTask('other')
    const res = await ctx.as('member').request('PATCH', `/tasks/${task.id}`, { status: 'DONE' })
    expect(res.statusCode).toBe(403)
  })

  it('MEMBER не удаляет даже свою задачу, MANAGER удаляет любую', async () => {
    const task = await createTask('member')
    expect((await ctx.as('member').request('DELETE', `/tasks/${task.id}`)).statusCode).toBe(403)
    expect((await ctx.as('manager').request('DELETE', `/tasks/${task.id}`)).statusCode).toBe(204)
    expect((await ctx.as('manager').request('GET', `/tasks/${task.id}`)).statusCode).toBe(404)
  })

  it('фильтр по статусу', async () => {
    const task = await createTask('member')
    await createTask('member')
    await ctx.as('member').request('PATCH', `/tasks/${task.id}`, { status: 'BLOCKED' })
    const res = await ctx.as('viewer').request('GET', '/tasks?status=BLOCKED')
    expect(res.json().map((t: { id: number }) => t.id)).toEqual([task.id])
  })
})

describe('комментарии', () => {
  it('MEMBER комментирует любую задачу, счётчик растёт', async () => {
    const task = await createTask('other')
    const res = await ctx.as('member').request('POST', `/tasks/${task.id}/comments`, { text: 'Посмотрю' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ text: 'Посмотрю', author: { name: 'member' } })
    const list = await ctx.as('viewer').request('GET', `/tasks/${task.id}/comments`)
    expect(list.json()).toHaveLength(1)
    const fresh = await ctx.as('viewer').request('GET', `/tasks/${task.id}`)
    expect(fresh.json().commentCount).toBe(1)
  })

  it('VIEWER не комментирует, пустой комментарий отклоняется', async () => {
    const task = await createTask('member')
    expect((await ctx.as('viewer').request('POST', `/tasks/${task.id}/comments`, { text: 'x' })).statusCode).toBe(403)
    expect((await ctx.as('member').request('POST', `/tasks/${task.id}/comments`, { text: ' ' })).statusCode).toBe(400)
  })

  it('чужой комментарий удаляет только ADMIN или MANAGER', async () => {
    const task = await createTask('member')
    const comment = (await ctx.as('other').request('POST', `/tasks/${task.id}/comments`, { text: 'x' })).json()
    expect((await ctx.as('member').request('DELETE', `/comments/${comment.id}`)).statusCode).toBe(403)
    expect((await ctx.as('admin').request('DELETE', `/comments/${comment.id}`)).statusCode).toBe(204)
  })

  it('комментарии удаляются вместе с задачей', async () => {
    const task = await createTask('member')
    await ctx.as('member').request('POST', `/tasks/${task.id}/comments`, { text: 'x' })
    await ctx.as('admin').request('DELETE', `/tasks/${task.id}`)
    expect(await ctx.prisma.comment.count()).toBe(0)
  })
})

describe('пользователи и проекты', () => {
  it('роль меняет только ADMIN', async () => {
    const url = `/users/${ctx.users.member.id}`
    expect((await ctx.as('manager').request('PATCH', url, { role: 'ADMIN' })).statusCode).toBe(403)
    const res = await ctx.as('admin').request('PATCH', url, { role: 'MANAGER' })
    expect(res.json().role).toBe('MANAGER')
  })

  it('проект создают ADMIN и MANAGER, ключ уникален', async () => {
    expect((await ctx.as('member').request('POST', '/projects', { key: 'NEW', name: 'Новый' })).statusCode).toBe(403)
    expect((await ctx.as('manager').request('POST', '/projects', { key: 'new', name: 'Новый' })).json().key).toBe('NEW')
    expect((await ctx.as('manager').request('POST', '/projects', { key: 'PJ1', name: 'Дубль' })).statusCode).toBe(409)
  })
})
