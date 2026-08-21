import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const dbAvailable = await ensureTables()
    if (!dbAvailable || !db) {
      return NextResponse.json({ success: false, message: 'Base de datos no configurada.' }, { status: 503 })
    }

    const { licenseKey, userId, deviceName } = await req.json()

    if (!licenseKey || !userId) {
      return NextResponse.json(
        { success: false, message: 'Se requiere la clave de licencia y el ID del usuario.' },
        { status: 400 }
      )
    }

    const license = await db.license.findFirst({
      where: { key: { equals: licenseKey } },
    })

    if (!license) {
      return NextResponse.json(
        { success: false, message: 'Clave de licencia no encontrada.' },
        { status: 404 }
      )
    }

    if (!license.active) {
      return NextResponse.json(
        { success: false, message: 'Esta licencia ha sido desactivada por el administrador.' },
        { status: 403 }
      )
    }

    if (license.userId && license.userId !== userId) {
      return NextResponse.json(
        { success: false, message: 'Esta licencia ya esta vinculada a otro dispositivo.' },
        { status: 403 }
      )
    }

    const updatedLicense = await db.license.update({
      where: { id: license.id },
      data: { userId, deviceName: deviceName || null, activatedAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      message: 'Licencia activada exitosamente.',
      license: updatedLicense,
    })
  } catch (error) {
    console.error('Error al activar licencia:', error)
    return NextResponse.json(
      { success: false, message: 'Error al activar la licencia.' },
      { status: 500 }
    )
  }
}
