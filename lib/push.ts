import webpush, { type PushSubscription as WebPushSubscription } from 'web-push'
import { db } from './db'

// ============================================================
// Web Push helper - configures VAPID and provides send helpers
// ============================================================

let configured = false

function configure() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:guardian@sos.app'

  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys missing. Generate them with: ./node_modules/.bin/web-push generate-vapid-keys --json ' +
      'and add VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to .env'
    )
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

/**
 * Send a push notification to ALL devices registered for a given userId.
 * Returns per-device results so the caller can prune dead subscriptions.
 */
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string
    body: string
    url?: string
    tag?: string
    requireInteraction?: boolean
    data?: Record<string, unknown>
  }
): Promise<{ sent: number; failed: number; removed: number; results: Array<{ endpoint: string; success: boolean; error?: string }> }> {
  configure()

  const subs = await db.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) {
    return { sent: 0, failed: 0, removed: 0, results: [] }
  }

  const payloadStr = JSON.stringify(payload)
  const results: Array<{ endpoint: string; success: boolean; error?: string }> = []
  let sent = 0
  let failed = 0
  let removed = 0

  await Promise.all(
    subs.map(async (sub) => {
      const pushSub: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      try {
        await webpush.sendNotification(pushSub, payloadStr)
        results.push({ endpoint: sub.endpoint, success: true })
        sent++
      } catch (err: any) {
        const statusCode = err?.statusCode || 0
        // 404 = subscription no longer exists
        // 410 = subscription expired / user unsubscribed
        // 413 = payload too large
        // These are permanent failures - prune the subscription
        if (statusCode === 404 || statusCode === 410) {
          try {
            await db.pushSubscription.delete({ where: { id: sub.id } })
            removed++
          } catch (_e) { /* already deleted */ }
        }
        results.push({
          endpoint: sub.endpoint,
          success: false,
          error: `${statusCode}: ${err?.message || 'unknown error'}`,
        })
        failed++
      }
    })
  )

  return { sent, failed, removed, results }
}

/**
 * Store or update a push subscription for a given userId.
 * Idempotent: re-subscribing the same endpoint just refreshes keys.
 */
export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
) {
  return db.pushSubscription.upsert({
    where: {
      userId_endpoint: { userId, endpoint: sub.endpoint },
    },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent || null,
    },
    update: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent || null,
      updatedAt: new Date(),
    },
  })
}

/**
 * Remove a push subscription (called when the user revokes permission
 * or manually unsubscribes).
 */
export async function removeSubscription(userId: string, endpoint: string) {
  try {
    await db.pushSubscription.delete({
      where: {
        userId_endpoint: { userId, endpoint },
      },
    })
    return true
  } catch (err: any) {
    // Already deleted - not an error
    if (err?.code === 'P2025') return true
    throw err
  }
}

/**
 * Count how many devices are subscribed for a given userId.
 * Useful for the UI to show "Tu alerta llegará a N dispositivo(s)".
 */
export async function countSubscriptions(userId: string): Promise<number> {
  return db.pushSubscription.count({ where: { userId } })
}
