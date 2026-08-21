import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const dbAvailable = await ensureTables()
    if (!dbAvailable || !db) {
      return NextResponse.json({ success: false, message: 'Base de datos no configurada.' }, { status: 503 })
    }

    const { adminPin, newAdminPin } = await req.json()

    if (!adminPin || !newAdminPin) {
      return NextResponse.json(
        { success: false, message: 'Se requiere el PIN actual y el nuevo PIN.' },
        { status: 400 }
      )
    }

    if (newAdminPin.length < 4) {
      return NextResponse.json(
        { success: false, message: 'El nuevo PIN debe tener al menos 4 caracteres.' },
        { status: 400 }
      )
    }

    const pinRecord = await db.adminPin.findFirst()
    if (!pinRecord || pinRecord.pin !== adminPin) {
      return NextResponse.json(
        { success: false, message: 'PIN de administrador actual incorrecto.' },
        { status: 403 }
      )
    }

    await db.adminPin.update({
      where: { id: pinRecord.id },
      data: { pin: newAdminPin },
    })

    return NextResponse.json({ success: true, message: 'PIN actualizado exitosamente.' })
  } catch (error) {
    console.error('Error al cambiar PIN:', error)
    return NextResponse.json(
      { success: false, message: 'Error al cambiar el PIN de administrador.' },
      { status: 500 }
    )
  }
}
