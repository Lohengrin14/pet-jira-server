// Тестовые данные: npm run db:seed (стирает всё и создаёт заново)
// С флагом --if-empty ничего не трогает, если пользователи уже есть (так seed запускается на Render)
import 'dotenv/config'
import { createPrisma } from '../src/db'

const prisma = createPrisma()

if (process.argv.includes('--if-empty') && (await prisma.user.count()) > 0) {
  console.log('Seed пропущен: в базе уже есть данные')
  await prisma.$disconnect()
  process.exit(0)
}

await prisma.comment.deleteMany()
await prisma.task.deleteMany()
await prisma.project.deleteMany()
await prisma.user.deleteMany()

// По одному, чтобы id шли по порядку: Василий = 1, Мария = 2 и т.д.
const vasily = await prisma.user.create({ data: { name: 'Василий', email: 'vasily@pet-jira.local', role: 'ADMIN' } })
const maria = await prisma.user.create({ data: { name: 'Мария', email: 'maria@pet-jira.local', role: 'MANAGER' } })
const ivan = await prisma.user.create({ data: { name: 'Иван', email: 'ivan@pet-jira.local', role: 'MEMBER' } })
await prisma.user.create({ data: { name: 'Ольга', email: 'olga@pet-jira.local', role: 'VIEWER' } })

const projects = [
  await prisma.project.create({ data: { key: 'PJ1', name: 'Проект 1', color: '#6366f1' } }),
  await prisma.project.create({ data: { key: 'PJ2', name: 'Проект 2', color: '#0ea5a4' } }),
  await prisma.project.create({ data: { key: 'PJ3', name: 'Проект 3', color: '#f59e0b' } }),
]

const tasks = [
  { project: 0, title: 'Сверстать страницу входа', status: 'TODO', priority: 'HIGH', author: vasily, assignee: ivan },
  { project: 0, title: 'Подключить доску к API', status: 'IN_PROGRESS', priority: 'CRITICAL', author: maria, assignee: vasily },
  { project: 1, title: 'Добавить тёмную тему', status: 'TODO', priority: 'LOW', author: ivan, assignee: null },
  { project: 1, title: 'Починить перенос карточек на телефоне', status: 'BLOCKED', priority: 'MEDIUM', author: ivan, assignee: ivan },
  { project: 2, title: 'Написать README для API', status: 'REVIEW', priority: 'MEDIUM', author: maria, assignee: maria },
] as const

for (const t of tasks) {
  const project = await prisma.project.update({
    where: { id: projects[t.project].id },
    data: { taskCount: { increment: 1 } },
  })
  const task = await prisma.task.create({
    data: {
      number: project.taskCount,
      projectId: project.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      authorId: t.author.id,
      assigneeId: t.assignee?.id ?? null,
    },
  })
  if (t.status === 'BLOCKED') {
    await prisma.comment.create({
      data: { taskId: task.id, authorId: maria.id, text: 'Что блокирует? Нужна помощь?' },
    })
  }
}

console.log('Seed готов: 4 пользователя, 3 проекта, 5 задач')
await prisma.$disconnect()
