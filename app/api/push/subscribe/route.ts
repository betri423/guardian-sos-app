import { NextResponse } from 'next/server'
import { saveSubscription } from '@/lib/push'

/**
 * POST /api/push/subscribe
 *
 * Stores a push subscription for the given userId. Called by the victim's
 * app when the user grants notification permission - this is what allows
 * a guardian to later wake the app via push.
 *
 * Body:
 *   { userId, subscription: { endpoint, keys: { p256dh, auth } } }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const userId = (body.userId || '').trim()
    const subscription = body.subscription

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Se requiere userId.' },
        { status: 400 }
      )
    }
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { success: false, message: 'Suscripción inválida.' },
        { status: 400 }
      )
    }

    const userAgent = req.headers.get('user-agent') || undefined
    await saveSubscription(userId, subscription, userAgent)

    return NextResponse.json({
      success: true,
      message: 'Suscripción de push guardada. Este dispositivo ahora puede recibir alertas del guardián.',
    })
  } catch (error) {
    console.error('Error al guardar suscripción push:', error)
    return NextResponse.json(
      { success: false, message: 'Error al guardar la suscripción.' },
      { status: 500 }
    )
  }
}
