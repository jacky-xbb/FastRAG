import { describe, it, expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'

// ingest-pipeline 顶层 import openrouter.js，后者要求 OPENROUTER_API_KEY 存在（不发真实请求）。
process.env.OPENROUTER_API_KEY ??= 'test-key'
const { deleteFileChunks } = await import('../src/lib/ingest-pipeline.js')

// 建一张最小 standards 表（deleteFileChunks 只碰 vector_id），灌入若干假块 id。
async function seed(ids: string[]): Promise<Client> {
  const client = createClient({ url: ':memory:' })
  await client.execute('CREATE TABLE standards (vector_id TEXT UNIQUE NOT NULL)')
  for (const id of ids) await client.execute({ sql: 'INSERT INTO standards (vector_id) VALUES (?)', args: [id] })
  return client
}

async function remainingIds(client: Client): Promise<string[]> {
  const { rows } = await client.execute('SELECT vector_id FROM standards ORDER BY vector_id')
  return rows.map((r) => r.vector_id as string)
}

describe('deleteFileChunks', () => {
  it('只删该文件名前缀的块，别的标准原样保留', async () => {
    const client = await seed(['JT_T_536.pdf#0', 'JT_T_536.pdf#1', 'GB18173.pdf#0'])
    await deleteFileChunks('JT_T_536.pdf', client)
    expect(await remainingIds(client)).toEqual(['GB18173.pdf#0'])
  })

  it('前缀精确比对：文件名里的下划线不被当 LIKE 通配符', async () => {
    // 若用 LIKE 'JT_T_536.pdf#%'，下划线会匹配任意单字符，误删 'JTaT_536.pdf#0'。
    const client = await seed(['JT_T_536.pdf#0', 'JTaT_536.pdf#0'])
    await deleteFileChunks('JT_T_536.pdf', client)
    expect(await remainingIds(client)).toEqual(['JTaT_536.pdf#0'])
  })

  it('近似前缀（536 vs 5360）不误删', async () => {
    const client = await seed(['JT_T_536.pdf#0', 'JT_T_5360.pdf#0'])
    await deleteFileChunks('JT_T_536.pdf', client)
    expect(await remainingIds(client)).toEqual(['JT_T_5360.pdf#0'])
  })

  it('库里没有该文件名时是空操作，不报错', async () => {
    const client = await seed(['GB18173.pdf#0'])
    await deleteFileChunks('NotThere.pdf', client)
    expect(await remainingIds(client)).toEqual(['GB18173.pdf#0'])
  })
})
