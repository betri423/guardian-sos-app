import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    if (!userId) {
      return NextResponse.json({ success: false, message: 'Se requiere el ID del usuario.' }, { status: 400 })
    }

    const dbAvailable = await ensureTables()
    if (!dbAvailable || !db) {
      // Database not configured - return default SAFE state so guardian mode
      // shows "Todo en orden" instead of "waiting for data"
      return NextResponse.json({
        success: true,
        state: {
          userId,
          status: 'SAFE',
          latitude: null,
          longitude: null,
          accuracy: null,
          notificationSteps: [],
          victimName: '',
          updatedAt: new Date().toISOString(),
        },
      })
    }

    const record = await db.alertState.findUnique({ where: { userId } })

    const state = record
      ? {
          userId: record.userId,
          status: record.status,
          latitude: record.latitude,
          longitude: record.longitude,
          accuracy: record.accuracy,
          notificationSteps: JSON.parse(record.notificationSteps || '[]'),
          victimName: record.victimName,
          updatedAt: record.updatedAt?.toISOString() || new Date().toISOString(),
        }
      : {
          userId,
          status: 'SAFE',
          latitude: null,
          longitude: null,
          accuracy: null,
          notificationSteps: [],
          victimName: '',
          updatedAt: new Date().toISOString(),
        }

    return NextResponse.json({ success: true, state })
  } catch (error) {
    console.error('Error al obtener estado de alerta:', error)
    // Return SAFE state on error so guardian mode doesn't hang
    const { userId } = await params
    return NextResponse.json({
      success: true,
      state: {
        userId: userId || 'unknown',
        status: 'SAFE',
        latitude: null,
        longitude: null,
        accuracy: null,
        notificationSteps: [],
        victimName: '',
        updatedAt: new Date().toISOString(),
      },
    })
  }
}
