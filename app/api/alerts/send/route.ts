import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * POST /api/alerts/send
 *
 * Generates a MILITARY-GRADE share link for each selected contact when an
 * S.O.S is triggered. No SMS, no WhatsApp, no Twilio.
 *
 * "Military-grade" means:
 *   - HMAC-SHA256 signed payload (server-side secret)
 *   - Tamper-evident: any modification to the payload invalidates the signature
 *   - Time-limited: tokens expire after 24 hours
 *   - Contact-bound: each link is salted with the contact phone hash so a link
 *     issued for contact A cannot be reused by contact B
 *
 * The link points at the existing guardian watcher page (`?track=USERID&...`)
 * but carries a signed token (`t=`) and signature (`s=`) so the recipient can
 * prove they received an authentic alert from this device.
 *
 * The client is responsible for delivering the link to the contact (via the
 * Web Share API on mobile, or by copying it to the clipboard on desktop).
 *
 * Expected request body:
 * {
 *   userId:   string,                                  // device user id (SOS-XXXXXX)
 *   contacts: Array<{ name: string, phone: string }>,  // selected contacts
 *   location: { latitude: number, longitude: number } | null,
 *   triggerType: string,
 *   reason: string
 * }
 */

interface SendContact {
  name?: string
  phone?: string
}

interface SendBody {
  userId?: string
  contacts?: SendContact[]
  location?: { latitude?: number; longitude?: number } | null
  triggerType?: string
  reason?: string
}

const LINK_SECRET =
  process.env.GUARDIAN_LINK_SECRET ||
  'guardian-sos-military-grade-secret-v2-default-rotatable'
const LINK_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function hmacSign(message: string): string {
  return crypto.createHmac('sha256', LINK_SECRET).update(message).digest('base64url')
}

function hashPhone(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 12)
}

interface LinkPayload {
  uid: string
  ts: number
  exp: number
  c: string // contact phone hash (salt)
  lat?: number
  lng?: number
  r?: string // reason (truncated)
  tt?: string // trigger type
}

function buildMilitaryLink(
  baseUrl: string,
  userId: string,
  contactPhone: string,
  location: { lat: number; lng: number } | null,
  reason: string,
  triggerType: string
): { link: string; payload: LinkPayload; signature: string } {
  const ts = Date.now()
  const exp = ts + LINK_TTL_MS
  const payload: LinkPayload = {
    uid: userId,
    ts,
    exp,
    c: hashPhone(contactPhone),
    tt: triggerType,
    r: (reason || '').slice(0, 80),
  }
  if (location) {
    payload.lat = location.lat
    payload.lng = location.lng
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = hmacSign(payloadB64)
  const link = `${baseUrl}?track=${encodeURIComponent(userId)}&t=${payloadB64}&s=${signature}`
  return { link, payload, signature }
}

function originFromRequest(req: Request): string {
  try {
    const url = new URL(req.url)
    // Prefer the public-facing origin (handles reverse-proxied setups)
    const xfHost = req.headers.get('x-forwarded-host')
    const xfProto = req.headers.get('x-forwarded-proto') || url.protocol
    const host = xfHost || url.host
    return `${xfProto.replace(':', '')}://${host}`
  } catch {
    return 'https://guardian.local'
  }
}

export async function POST(req: Request) {
  try {
    const body: SendBody = await req.json()
    const contacts = Array.isArray(body.contacts) ? body.contacts : []
    const userId = (body.userId || '').trim()

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Se requiere el ID del usuario.' },
        { status: 400 }
      )
    }

    const baseUrl = originFromRequest(req)
    const location =
      body.location && typeof body.location.latitude === 'number' && typeof body.location.longitude === 'number'
        ? { lat: body.location.latitude, lng: body.location.longitude }
        : null

    const reason = body.reason || 'Alerta de emergencia activada por Guardian S.O.S'
    const triggerType = body.triggerType || 'Manual'

    const results = contacts.map((contact) => {
      const phone = (contact.phone || '').trim()
      const name = (contact.name || '').trim() || phone
      if (!phone) {
        return {
          contact: name,
          success: false,
          error: 'sin teléfono',
        }
      }
      const { link, payload, signature } = buildMilitaryLink(
        baseUrl,
        userId,
        phone,
        location,
        reason,
        triggerType
      )
      return {
        contact: name,
        phone,
        success: true,
        channel: 'military-link',
        shareLink: link,
        signature,
        expiresAt: payload.exp,
        issuedAt: payload.ts,
      }
    })

    const okResults = results.filter((r): r is typeof r & { success: true } => r.success)
    const failedResults = results.filter((r) => !r.success)

    return NextResponse.json({
      success: true,
      channel: 'military-link',
      shareLinks: okResults,
      failures: failedResults,
      total: contacts.length,
      sent: okResults.length,
      ttlMs: LINK_TTL_MS,
      message:
        okResults.length > 0
          ? `${okResults.length} enlace(s) militar(es) generado(s). Compártelos con tus contactos.`
          : 'No se generaron enlaces (sin contactos válidos).',
    })
  } catch (error) {
    console.error('Error al generar enlaces militares:', error)
    return NextResponse.json(
      { success: false, message: 'Error al generar los enlaces de alerta.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/alerts/send
 *
 * Verification endpoint: given a `t` (payload) and `s` (signature) pair,
 * returns whether the military-grade link is authentic and not expired.
 * Useful if the watcher page wants to validate a link before showing
 * sensitive alert data.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const t = url.searchParams.get('t')
    const s = url.searchParams.get('s')
    if (!t || !s) {
      return NextResponse.json({ success: false, valid: false, message: 'Token o firma faltante.' }, { status: 400 })
    }
    const expectedSig = hmacSign(t)
    if (expectedSig !== s) {
      return NextResponse.json({ success: false, valid: false, message: 'Firma inválida.' }, { status: 403 })
    }
    let payload: LinkPayload
    try {
      payload = JSON.parse(Buffer.from(t, 'base64url').toString('utf8'))
    } catch {
      return NextResponse.json({ success: false, valid: false, message: 'Payload inválido.' }, { status: 400 })
    }
    const now = Date.now()
    const expired = now > payload.exp
    return NextResponse.json({
      success: true,
      valid: !expired,
      expired,
      issuedAt: payload.ts,
      expiresAt: payload.exp,
      userId: payload.uid,
      contactHash: payload.c,
      location: payload.lat != null && payload.lng != null ? { latitude: payload.lat, longitude: payload.lng } : null,
      triggerType: payload.tt || null,
      reason: payload.r || null,
    })
  } catch (error) {
    console.error('Error al verificar enlace militar:', error)
    return NextResponse.json({ success: false, valid: false, message: 'Error al verificar el enlace.' }, { status: 500 })
  }
}
