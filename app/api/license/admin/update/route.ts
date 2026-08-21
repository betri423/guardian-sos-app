import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const dbAvailable = await ensureTables()
    if (!dbAvailable || !db) {
      return NextResponse.json({ success: false, message: 'Base de datos no configurada.' }, { status: 503 })
    }

    const { adminPin, licenseKey, active, unbind } = await req.json()

    if (!adminPin) {
      return NextResponse.json(
        { success: false, message: 'Se requiere el PIN de administrador.' },
        { status: 400 }
      )
    }

    const pinRecord = await db.adminPin.findFirst()
    if (!pinRecord || pinRecord.pin !== adminPin) {
      return NextResponse.json(
        { success: false, message: 'PIN de administrador incorrecto.' },
        { status: 403 }
      )
    }

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, message: 'Se requiere la clave de licencia.' },
        { status: 400 }
      )
    }

    const license = await db.license.findFirst({ where: { key: { equals: licenseKey } } })
    if (!license) {
      return NextResponse.json(
        { success: false, message: 'Licencia no encontrada.' },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (typeof active === 'boolean') updateData.active = active
    if (unbind === true) {
      updateData.userId = null
      updateData.deviceName = null
      updateData.activatedAt = null
    }

    const updatedLicense = await db.license.update({
      where: { id: license.id },
      data: updateData,
    })

    return NextResponse.json({ success: true, license: updatedLicense })
  } catch (error) {
    console.error('Error al actualizar licencia:', error)
    return NextResponse.json(
      { success: false, message: 'Error al actualizar la licencia.' },
      { status: 500 }
    )
  }
}
