import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

// Append a transcript entry to the existing AlertState.transcript array
export async function POST(req: Request) {
  try {
    const { userId, text } = await req.json()
    if (!userId || !text) {
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const dbAvailable = await ensureTables()
    if (!dbAvailable || !db) {
      return NextResponse.json({ success: true, warning: 'Database not configured' })
    }

    // Read current transcript
    const record = await db.alertState.findUnique({ where: { userId } })
    let existing: { text: string; time: string }[] = []
    if (record) {
      try { existing = JSON.parse((record as any).transcript || '[]') } catch(_e) { existing = [] }
    }
    // Append new entry, keep last 80
    existing.push({ text, time: new Date().toISOString() })
    if (existing.length > 80) existing = existing.slice(-80)

    // Update only the transcript column
    await db.alertState.upsert({
      where: { userId },
      create: {
        userId,
        status: 'SAFE',
        transcript: JSON.stringify(existing),
      },
      update: {
        transcript: JSON.stringify(existing),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
