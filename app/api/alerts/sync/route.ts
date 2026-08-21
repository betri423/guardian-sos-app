import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId, status, latitude, longitude, accuracy, notificationSteps, victimName } = body

    if (!userId || !status) {
      return NextResponse.json({ success: false, message: 'Se requiere userId y status.' }, { status: 400 })
    }

    const dbAvailable = await ensureTables()
    if (!dbAvailable || !db) {
      // Database not configured - accept the sync but don't persist
      return NextResponse.json({ success: true, warning: 'Database not configured' })
    }

    await db.alertState.upsert({
      where: { userId },
      create: {
        userId, status,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        accuracy: accuracy ?? null,
        notificationSteps: JSON.stringify(notificationSteps || []),
        victimName: victimName || '',
      },
      update: {
        status,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        accuracy: accuracy ?? null,
        notificationSteps: JSON.stringify(notificationSteps || []),
        victimName: victimName || '',
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al sincronizar alerta:', error)
    return NextResponse.json({ success: false, message: 'Error al sincronizar la alerta.' }, { status: 500 })
  }
}
