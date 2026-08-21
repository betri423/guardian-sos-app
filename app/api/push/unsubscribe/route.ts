import { NextResponse } from 'next/server'
import { removeSubscription } from '@/lib/push'

/**
 * POST /api/push/unsubscribe
 *
 * Removes a push subscription. Called when the user revokes notification
 * permission, logs out, or manually disables push.
 *
 * Body:
 *   { userId, endpoint }
 */
export async function POST(req: Request) {
  try {
    const { userId, endpoint } = await req.json()
    if (!userId || !endpoint) {
      return NextResponse.json(
        { success: false, message: 'Se requiere userId y endpoint.' },
        { status: 400 }
      )
    }
    await removeSubscription(userId, endpoint)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al eliminar suscripción push:', error)
    return NextResponse.json(
      { success: false, message: 'Error al eliminar la suscripción.' },
      { status: 500 }
    )
  }
}
