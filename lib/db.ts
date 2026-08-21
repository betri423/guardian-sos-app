import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    console.warn('[db] DATABASE_URL not set - database features disabled')
    return null
  }
  try {
    return new PrismaClient({
      log: ['error', 'warn'],
    })
  } catch (err) {
    console.error('[db] Failed to create PrismaClient:', err)
    return null
  }
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production' && db) {
  globalForPrisma.prisma = db as PrismaClient
}

export async function ensureTables(): Promise<boolean> {
  if (!db) {
    return false
  }
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch (err) {
    console.error('[db] ensureTables failed:', err)
    return false
  }
}
