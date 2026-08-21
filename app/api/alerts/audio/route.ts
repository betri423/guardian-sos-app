import { NextResponse } from 'next/server'

const globalForAudio = globalThis as unknown as {
  audioChunks: Map<string, string>
}

const audioStore = globalForAudio.audioChunks || new Map<string, string>()
if (!globalForAudio.audioChunks) globalForAudio.audioChunks = audioStore

export async function POST(req: Request) {
  try {
    const { userId, audio } = await req.json()
    if (!userId || !audio) {
      return NextResponse.json({ success: false, message: 'Se requiere userId y audio.' }, { status: 400 })
    }
    audioStore.set(userId, audio)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al guardar audio:', error)
    return NextResponse.json({ success: false, message: 'Error al guardar audio.' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Se requiere el ID del usuario.' }, { status: 400 })
    }
    const audio = audioStore.get(userId) || null
    return NextResponse.json({ success: true, audio })
  } catch (error) {
    console.error('Error al obtener audio:', error)
    return NextResponse.json({ success: false, message: 'Error al obtener audio.' }, { status: 500 })
  }
}