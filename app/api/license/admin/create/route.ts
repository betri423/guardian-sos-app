import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { adminPin, key } = await req.json()

    if (!adminPin) {
      return NextResponse.json(
        { success: false, message: 'Se requiere el PIN de administrador.' },
        { status: 400 }
      )
    }

    // Allow default PIN 9988 always (for initial setup)
    if (adminPin !== '9988') {
      // For custom PINs, verify against database
      const dbAvailable = await ensureTables()
      
      if (!dbAvailable || !db) {
        return NextResponse.json({
          success: false,
          message: 'Base de datos no configurada.',
        }, { status: 503 })
      }

      try {
        const pinRecord = await db.adminPin.findFirst()
        if (!pinRecord || pinRecord.pin !== adminPin) {
          return NextResponse.json(
            { success: false, message: 'PIN de administrador incorrecto.' },
            { status: 403 }
          )
        }
      } catch (pinError) {
        return NextResponse.json(
          { success: false, message: 'Error al verificar PIN.' },
          { status: 500 }
        )
      }
    }

    // Now check database for creating the license
    const dbAvailable = await ensureTables()
    
    if (!dbAvailable || !db) {
      return NextResponse.json({
        success: false,
        message: 'Base de datos no disponible. Haz clic en "Inicializar Base de Datos" primero.',
      }, { status: 503 })
    }

    // Generate license key format: SOS-XXXX-XXXX-0000-0000
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const digits = '0123456789'

    const generateKey = (): string => {
      let c1 = '', c2 = '', c3 = '', c4 = ''
      for (let i = 0; i < 4; i++) {
        c1 += chars.charAt(Math.floor(Math.random() * chars.length))
        c2 += chars.charAt(Math.floor(Math.random() * chars.length))
        c3 += digits.charAt(Math.floor(Math.random() * digits.length))
        c4 += digits.charAt(Math.floor(Math.random() * digits.length))
      }
      return `SOS-${c1}-${c2}-${c3}-${c4}`
    }

    let licenseKey = (key?.trim() || '').toUpperCase()

    if (!licenseKey) {
      // Auto-generate unique key
      let unique = false
      while (!unique) {
        licenseKey = generateKey()
        try {
          const existing = await db.license.findFirst({ 
            where: { key: licenseKey } 
          })
          if (!existing) unique = true
        } catch (e) {
          unique = true // If query fails, assume it's unique
        }
      }
    } else {
      // Validate custom key doesn't exist
      try {
        const existing = await db.license.findFirst({ 
          where: { key: licenseKey } 
        })
        if (existing) {
          return NextResponse.json(
            { success: false, message: 'Ya existe una licencia con esa clave.' },
            { status: 409 }
          )
        }
      } catch (e) {
        // Continue - might be table doesn't exist yet
      }
    }

    // Create the license - use simpler approach
    try {
      const license = await db.license.create({
        data: { 
          key: licenseKey, 
          active: true,
        },
      })

      return NextResponse.json({ success: true, license })
    } catch (createError: any) {
      console.error('[create] Error creating license:', createError)
      
      // If table doesn't exist, suggest running setup
      if (createError.message?.includes('does not exist') || 
          createError.code === '42P01' ||
          createError.message?.includes('relation')) {
        return NextResponse.json({
          success: false,
          message: 'La tabla no existe. Ejecuta "Inicializar Base de Datos" primero.',
        }, { status: 400 })
      }
      
      return NextResponse.json(
        { success: false, message: 'Error al crear: ' + createError.message },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error al crear licencia:', error)
    return NextResponse.json(
      { success: false, message: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}