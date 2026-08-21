import { NextResponse } from 'next/server'
import { db, ensureTables } from '@/lib/db'

export async function POST() {
  try {
    // First check if DB is available
    const dbAvailable = await ensureTables()
    
    if (!dbAvailable || !db) {
      // Database not available - return default PIN for offline mode
      return NextResponse.json({ 
        success: true, 
        pin: '9988', 
        seeded: false,
        dbAvailable: false
      })
    }

    let pinRecord = null
    
    try {
      pinRecord = await db.adminPin.findFirst()
    } catch (tableError: any) {
      console.warn('[init-pin] Table error:', tableError.message)
      return NextResponse.json({ 
        success: true, 
        pin: '9988', 
        seeded: false,
        dbAvailable: true,
        tableExists: false
      })
    }

    if (!pinRecord) {
      try {
        pinRecord = await db.adminPin.create({
          data: { pin: '9988' },
        })
      } catch (createError: any) {
        return NextResponse.json({ 
          success: true, 
          pin: '9988', 
          seeded: false,
          error: createError.message
        })
      }
    }

    return NextResponse.json({
      success: true,
      pin: pinRecord.pin,
      seeded: pinRecord.pin === '9988',
      dbAvailable: true,
      tableExists: true
    })
  } catch (error) {
    console.error('Error al inicializar PIN:', error)
    return NextResponse.json({ 
      success: true, 
      pin: '9988', 
      seeded: false,
      error: 'Unknown error'
    })
  }
}