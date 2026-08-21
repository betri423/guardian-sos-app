import { NextResponse } from 'next/server'

/**
 * GET /api/push/vapid-key
 *
 * Returns the VAPID public key so the browser can subscribe to push
 * notifications via the PushManager API. The public key is safe to
 * expose to the client - only the private key (server-side) can send
 * pushes.
 */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json(
      { success: false, message: 'VAPID no configurado en el servidor.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true, publicKey })
}
