import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { licenseKey } = await req.json()

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, message: 'Se requiere la clave de licencia.' },
        { status: 400 }
      )
    }

    // Check if database is available
    const dbAvailable = await ensureTables()
    
    if (!dbAvailable || !db) {
      // Database not configured - require license screen to show
      return NextResponse.json({
        success: true,
        active: false,
        demoMode: false,
        message: 'Base de datos no configurada. Contacte al administrador.',
      })
    }

    // Look for the license key in database
    const license = await db.license.findFirst({
      where: { 
        key: licenseKey.trim().toUpperCase(),
        active: true 
      },
    })

    if (license) {
      // License found and active
      return NextResponse.json({
        success: true,
        active: true,
        licenseKey: license.key,
        activatedAt: license.activatedAt,
        license,
      })
    }

    // License not found or not active
    return NextResponse.json({
      success: true,
      active: false,
      message: 'Licencia no válida o inactiva.',
    })
  } catch (error) {
    console.error('Error al verificar licencia:', error)
    // On error, return inactive so user sees license screen
    return NextResponse.json({
      success: false,
      active: false,
      message: 'Error al verificar la licencia.',
    }, { status: 500 })
  }
}