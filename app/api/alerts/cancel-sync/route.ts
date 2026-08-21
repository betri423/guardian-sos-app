import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ success: false, message: 'Se requiere el ID del usuario.' }, { status: 400 })
    }

    const dbAvailable = await ensureTables()
    if (!dbAvailable || !db) {
      return NextResponse.json({ success: true, warning: 'Database not configured' })
    }

    await db.alertState.upsert({
      where: { userId },
      create: { userId, status: 'SAFE' },
      update: { status: 'SAFE' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al cancelar alerta:', error)
    return NextResponse.json({ success: false, message: 'Error al cancelar la alerta.' }, { status: 500 })
  }
}
