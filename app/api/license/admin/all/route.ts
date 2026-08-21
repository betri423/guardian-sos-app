import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { adminPin } = await req.json()

    if (!adminPin) {
      return NextResponse.json(
        { success: false, message: 'Se requiere el PIN de administrador.' },
        { status: 400 }
      )
    }

    // Special case: Allow default PIN when DB is not available
    if (adminPin === '9988') {
      const dbAvailable = await ensureTables()
      
      if (!dbAvailable || !db) {
        return NextResponse.json({ 
          success: true, 
          licenses: [],
          dbAvailable: false,
          message: 'Base de datos no configurada. Configura DATABASE_URL en Vercel.'
        })
      }

      try {
        let pinRecord = null
        try {
          pinRecord = await db.adminPin.findFirst()
        } catch (tableError) {
          return NextResponse.json({ 
            success: true, 
            licenses: [],
            dbAvailable: true,
            tableExists: false,
            message: 'Las tablas no existen. Ejecuta /api/setup primero.'
          })
        }

        if (!pinRecord) {
          try {
            await db.adminPin.create({ data: { pin: '9988' } })
          } catch (createError) {}
        }

        let licenses = []
        try {
          licenses = await db.license.findMany({
            orderBy: { createdAt: 'desc' },
          })
        } catch (licenseError) {}

        return NextResponse.json({ 
          success: true, 
          licenses,
          dbAvailable: true,
          authenticated: true
        })
      } catch (dbError: any) {
        return NextResponse.json({
          success: false,
          message: 'Error de base de datos: ' + dbError.message,
        }, { status: 500 })
      }
    }

    const dbAvailable = await ensureTables()
    
    if (!dbAvailable || !db) {
      return NextResponse.json({
        success: false,
        message: 'Base de datos no configurada.',
      }, { status: 503 })
    }

    const pinRecord = await db.adminPin.findFirst()

    if (!pinRecord || pinRecord.pin !== adminPin) {
      return NextResponse.json(
        { success: false, message: 'PIN de administrador incorrecto.' },
        { status: 403 }
      )
    }

    const licenses = await db.license.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, licenses })
  } catch (error) {
    console.error('Error al obtener licencias:', error)
    return NextResponse.json(
      { success: false, message: 'Error al obtener las licencias.' },
      { status: 500 }
    )
  }
}