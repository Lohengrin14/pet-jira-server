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

  it('без токена задачи и пользователи не отдаются', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/tasks' })).statusCode).toBe(401)
    expect((await ctx.app.inject({ method: 'GET', url: '/users' })).statusCode).toBe(401)
  })

  it('/auth/options сообщает, какие способы входа включены', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/options' })
    expect(res.json()).toEqual({ googleClientId: 'test-client-id', devLogin: true })
  })

  it('тестовый вход не пускает в ADMIN и в Google-аккаунты', async () => {
    const list = await ctx.app.inject({ method: 'GET', url: '/auth/dev-users' })
    expect(list.json().map((u: { name: string }) => u.name)).toEqual(['manager', 'member', 'other', 'viewer'])
    const admin = await ctx.app.inject({ method: 'POST', url: '/auth/dev-login', payload: { userId: ctx.users.admin.id } })
    expect(admin.statusCode).toBe(403)

    const google = (await googleLogin('google:g-1:anna@gmail.com:Анна')).json()
    const asGoogle = await ctx.app.inject({ method: 'POST', url: '/auth/dev-login', payload: { userId: google.user.id } })
    expect(asGoogle.statusCode).toBe(403)
  })
})

function googleLogin(credential: string) {
  return ctx.app.inject({ method: 'POST', url: '/auth/google', payload: { credential } })
}

describe('вход через Google', () => {
  it('новый пользователь создаётся наблюдателем, повторный вход находит его же', async () => {
    const first = await googleLogin('google:g-1:anna@gmail.com:Анна')
    expect(first.statusCode).toBe(200)
    expect(first.json().user).toMatchObject({ name: 'Анна', email: 'anna@gmail.com', role: 'VIEWER' })
    const again = await googleLogin('google:g-1:anna@gmail.com:Анна')
    expect(again.json().user.id).toBe(first.json().user.id)
    const me = await ctx.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${again.json().token}` } })
    expect(me.json().email).toBe('anna@gmail.com')
  })

  it('email из ADMIN_EMAILS получает роль ADMIN (регистр не важен)', async () => {
    const res = await googleLogin('google:g-2:boss@gmail.com:Босс')
    expect(res.json().user.role).toBe('ADMIN')
  })

  it('пользователь, заведённый админом заранее, привязывается по email и сохраняет роль', async () => {
    const res = await googleLogin('google:g-3:member@test.local:Кто-то')
    expect(res.json().user).toMatchObject({ id: ctx.users.member.id, name: 'member', role: 'MEMBER' })
  })

  it('неподтверждённый токен отклоняется', async () => {
    expect((await googleLogin('fake')).statusCode).toBe(401)
    expect((await googleLogin('')).statusCode).toBe(400)
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

  it('VIEWER получает понятную ошибку при попытке изменить задачу', async () => {
    const task = await createTask('member')
    const res = await ctx.as('viewer').request('PATCH', `/tasks/${task.id}`, { status: 'DONE' })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('VIEWER не может менять задачи')
  })

  it('MEMBER не удаляет даже свою задачу, MANAGER удаляет любую', async () => {
    const task = await createTask('member')
    expect((await ctx.as('member').request('DELETE', `/tasks/${task.id}`)).statusCode).toBe(403)
    expect((await ctx.as('manager').request('DELETE', `/tasks/${task.id}`)).statusCode).toBe(204)
    expect((await ctx.as('manager').request('GET', `/tasks/${task.id}`)).statusCode).toBe(404)
  })

  it('DELETE с Content-Type: application/json и пустым телом работает, битый JSON даёт 400', async () => {
    const task = await createTask('member')
    const headers = { authorization: `Bearer ${ctx.app.jwt.sign({ sub: ctx.users.manager.id })}`, 'content-type': 'application/json' }
    const del = await ctx.app.inject({ method: 'DELETE', url: `/tasks/${task.id}`, headers })
    expect(del.statusCode).toBe(204)
    const broken = await ctx.app.inject({ method: 'POST', url: '/tasks', headers, payload: '{oops' })
    expect(broken.statusCode).toBe(400)
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

describe('пользователи', () => {
  it('роль меняет только ADMIN', async () => {
    const url = `/users/${ctx.users.member.id}`
    const denied = await ctx.as('manager').request('PATCH', url, { name: 'Иван' })
    expect(denied.statusCode).toBe(403)
    expect(denied.json().error).toBe('Пользователями управляет только ADMIN')
    const res = await ctx.as('admin').request('PATCH', url, { role: 'MANAGER', email: 'NEW@Test.local' })
    expect(res.json()).toMatchObject({ role: 'MANAGER', email: 'new@test.local' })
  })

  it('ADMIN создаёт пользователя, email уникален и проверяется', async () => {
    const created = await ctx.as('admin').request('POST', '/users', { name: 'Пётр', email: 'petr@test.local' })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ name: 'Пётр', role: 'MEMBER' })
    const duplicate = await ctx.as('admin').request('POST', '/users', { name: 'Дубль', email: 'PETR@test.local' })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error).toBe('Пользователь с таким email уже есть')
    expect((await ctx.as('admin').request('POST', '/users', { name: 'X', email: 'не email' })).statusCode).toBe(400)
    expect((await ctx.as('manager').request('POST', '/users', { name: 'X', email: 'x@test.local' })).statusCode).toBe(403)
  })

  it('ADMIN не может снять с себя роль и удалить себя', async () => {
    const url = `/users/${ctx.users.admin.id}`
    expect((await ctx.as('admin').request('PATCH', url, { role: 'MEMBER' })).statusCode).toBe(400)
    expect((await ctx.as('admin').request('DELETE', url)).statusCode).toBe(400)
  })

  it('удаление: исполнителя снимаем с задач, автора задач не удаляем', async () => {
    const task = await createTask('member', { assigneeId: ctx.users.other.id })
    expect((await ctx.as('admin').request('DELETE', `/users/${ctx.users.member.id}`)).statusCode).toBe(409)
    expect((await ctx.as('manager').request('DELETE', `/users/${ctx.users.other.id}`)).statusCode).toBe(403)
    expect((await ctx.as('admin').request('DELETE', `/users/${ctx.users.other.id}`)).statusCode).toBe(204)
    const fresh = await ctx.as('admin').request('GET', `/tasks/${task.id}`)
    expect(fresh.json().assignee).toBeNull()
  })

  it('токен удалённого пользователя больше не работает', async () => {
    await ctx.as('admin').request('DELETE', `/users/${ctx.users.viewer.id}`)
    expect((await ctx.as('viewer').request('GET', '/tasks')).statusCode).toBe(401)
  })
})

describe('проекты', () => {
  it('проект создают ADMIN и MANAGER, ключ уникален', async () => {
    expect((await ctx.as('member').request('POST', '/projects', { key: 'NEW', name: 'Новый' })).statusCode).toBe(403)
    expect((await ctx.as('manager').request('POST', '/projects', { key: 'new', name: 'Новый' })).json().key).toBe('NEW')
    expect((await ctx.as('manager').request('POST', '/projects', { key: 'PJ1', name: 'Дубль' })).statusCode).toBe(409)
  })

  it('название и цвет меняются, ключ нет', async () => {
    const url = `/projects/${ctx.project.id}`
    expect((await ctx.as('member').request('PATCH', url, { name: 'X' })).statusCode).toBe(403)
    expect((await ctx.as('admin').request('PATCH', url, { color: 'red' })).statusCode).toBe(400)
    const res = await ctx.as('manager').request('PATCH', url, { name: 'Главный', color: '#ff0000', key: 'ZZZ' })
    expect(res.json()).toMatchObject({ name: 'Главный', color: '#ff0000', key: 'PJ1' })
  })

  it('проект с задачами не удаляется, пустой удаляется', async () => {
    await createTask('member')
    expect((await ctx.as('admin').request('DELETE', `/projects/${ctx.project.id}`)).statusCode).toBe(409)
    const empty = (await ctx.as('admin').request('POST', '/projects', { key: 'EMPTY', name: 'Пустой' })).json()
    expect((await ctx.as('member').request('DELETE', `/projects/${empty.id}`)).statusCode).toBe(403)
    expect((await ctx.as('admin').request('DELETE', `/projects/${empty.id}`)).statusCode).toBe(204)
  })
})
