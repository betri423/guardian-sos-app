import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'

/**
 * POST /api/push/send
 *
 * Guardian sends a push notification to the victim's device(s).
 * This wakes up the victim's app even if it's closed (assuming the
 * victim has previously subscribed and granted notification permission).
 *
 * Body:
 *   {
 *     targetUserId: string,            // victim's userId (SOS-XXXXXX)
 *     title?: string,                  // notification title (default "Guardián")
 *     body?: string,                   // notification body
 *     type?: 'ping' | 'checkin' | 'alert' | 'custom',
 *     guardianName?: string,           // optional - shown in notification
 *   }
 *
 * The push payload includes a URL that opens the victim's app with a
 * ?wakeup=1 query param so the victim's UI can show "Guardián te está
 * contactando".
 *
 * NOTE: This endpoint is intentionally unauthenticated to keep the PWA
 * simple. In production, add an auth check (the same admin PIN, a
 * guardian-specific token, etc.) before calling sendPushToUser.
 */

interface PushSendBody {
  targetUserId?: string
  title?: string
  body?: string
  type?: 'ping' | 'checkin' | 'alert' | 'custom'
  guardianName?: string
}

const TYPE_TITLES: Record<string, string> = {
  ping: '🔔 Tu guardián te busca',
  checkin: '📍 Tu guardián pide check-in',
  alert: '🚨 Tu guardián activó una alerta',
  custom: '🛡️ Mensaje de tu guardián',
}

export async function POST(req: Request) {
  try {
    const body: PushSendBody = await req.json()
    const targetUserId = (body.targetUserId || '').trim()

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, message: 'Se requiere targetUserId (el userId de la víctima).' },
        { status: 400 }
      )
    }

    const type = body.type || 'ping'
    const guardianName = (body.guardianName || '').trim()
    const title = body.title || TYPE_TITLES[type] || TYPE_TITLES.ping
    const bodyText =
      body.body ||
      (guardianName
        ? `${guardianName} te está contactando. Toca para abrir Guardian S.O.S.`
        : 'Tu guardián te está contactando. Toca para abrir Guardian S.O.S.')

    // The URL the notification will open when clicked. Adds ?wakeup=1 so
    // the victim's app can react (show a banner, vibrate, etc.).
    const origin = (() => {
      try {
        const url = new URL(req.url)
        const xfHost = req.headers.get('x-forwarded-host')
        const xfProto = req.headers.get('x-forwarded-proto') || url.protocol
        const host = xfHost || url.host
        return `${xfProto.replace(':', '')}://${host}`
      } catch {
        return ''
      }
    })()

    const wakeUrl = origin ? `${origin}/?wakeup=1&from=${encodeURIComponent(guardianName || 'guardian')}` : '/?wakeup=1'

    const result = await sendPushToUser(targetUserId, {
      title,
      body: bodyText,
      url: wakeUrl,
      tag: `guardian-${type}`,
      requireInteraction: true,
      data: {
        type,
        guardianName,
        sentAt: Date.now(),
      },
    })

    if (result.sent === 0) {
      return NextResponse.json({
        success: false,
        message: 'El usuario no tiene dispositivos suscritos a push. Debe abrir la app y aceptar notificaciones primero.',
        sent: 0,
        failed: result.failed,
        removed: result.removed,
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: `Alerta push enviada a ${result.sent} dispositivo(s) de ${targetUserId}.`,
      sent: result.sent,
      failed: result.failed,
      removed: result.removed,
      targetUserId,
      type,
    })
  } catch (error) {
    console.error('Error al enviar push:', error)
    return NextResponse.json(
      { success: false, message: 'Error al enviar la alerta push.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/push/send?targetUserId=SOS-XXXX
 *
 * Quick health-check endpoint: returns how many devices are subscribed
 * for a given user, without sending anything. Useful for the guardian UI
 * to show "✓ Víctima tiene N dispositivo(s) suscrito(s)".
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const targetUserId = url.searchParams.get('targetUserId')
    if (!targetUserId) {
      return NextResponse.json(
        { success: false, message: 'Se requiere targetUserId.' },
        { status: 400 }
      )
    }
    // Lazy import to avoid circular dependency issues
    const { countSubscriptions } = await import('@/lib/push')
    const count = await countSubscriptions(targetUserId)
    return NextResponse.json({
      success: true,
      targetUserId,
      deviceCount: count,
      reachable: count > 0,
    })
  } catch (error) {
    console.error('Error al contar suscripciones:', error)
    return NextResponse.json(
      { success: false, message: 'Error al verificar dispositivos suscritos.' },
      { status: 500 }
    )
  }
}
