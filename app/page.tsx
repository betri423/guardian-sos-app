'use client'
// Guardian S.O.S v2.1 - PostgreSQL (Neon)

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, ShieldAlert, Users, MapPin, Plus, Trash2, CheckCircle2,
  Bluetooth, AlertTriangle, Key, Clock, Settings, Send, RefreshCw,
  Phone, Volume2, VolumeX, Copy, Check, Battery, Smartphone,
  Headphones, ExternalLink, Share2, Loader2, Activity,
  Link2, Eye, XCircle, Radio, Navigation, ArrowLeft, LogOut,
  UserPlus, MessageCircle, Wifi, WifiOff, MapPinned, StopCircle,
  Bell, BellOff, Gauge, Signal, User, Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

// ==================== SAFE LOCAL STORAGE ====================
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch (e) { return null }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch (e) { /* noop */ }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key) } catch (e) { /* noop */ }
  },
}

// ==================== ALARM SOUND (Web Audio API - sawtooth oscillator) ====================
let audioCtx: AudioContext | null = null
let sirenInterval: ReturnType<typeof setInterval> | null = null

function startAlarmSound() {
  if (sirenInterval) return
  audioCtx = new AudioContext()
  let state = true
  sirenInterval = setInterval(() => {
    if (!audioCtx) return
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(state ? 950 : 1300, audioCtx.currentTime)
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.4)
    state = !state
  }, 450)
}

function stopAlarmSound() {
  if (sirenInterval) { clearInterval(sirenInterval); sirenInterval = null }
  if (audioCtx) { try { audioCtx.close() } catch (e) { /* noop */ } audioCtx = null }
}

// ==================== BACKGROUND KEEP-ALIVE (silent audio loop) ====================
// Plays an inaudible oscillator to prevent mobile browsers from
// suspending the tab when the user switches to another app. Only
// effective while the alarm is active. Stops automatically when the
// alarm is stopped.
let keepAliveCtx: AudioContext | null = null
let keepAliveOsc: OscillatorNode | null = null
let keepAliveGain: GainNode | null = null

function startBackgroundKeepAlive() {
  if (keepAliveCtx) return // already running
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    keepAliveCtx = new Ctx()
    keepAliveOsc = keepAliveCtx.createOscillator()
    keepAliveGain = keepAliveCtx.createGain()
    keepAliveGain.gain.value = 0.0001 // effectively silent
    keepAliveOsc.type = 'sine'
    keepAliveOsc.frequency.value = 1 // 1 Hz - imperceptible
    keepAliveOsc.connect(keepAliveGain)
    keepAliveGain.connect(keepAliveCtx.destination)
    keepAliveOsc.start()
    console.log('[BG] Keep-alive audio iniciado')
  } catch (e) {
    console.warn('[BG] No se pudo iniciar keep-alive:', e)
  }
}

function stopBackgroundKeepAlive() {
  try {
    if (keepAliveOsc) { try { keepAliveOsc.stop() } catch (_e) {} keepAliveOsc = null }
    if (keepAliveGain) { keepAliveGain = null }
    if (keepAliveCtx) { try { keepAliveCtx.close() } catch (_e) {} keepAliveCtx = null }
    console.log('[BG] Keep-alive audio detenido')
  } catch (e) { /* noop */ }
}

// ==================== WAKE LOCK (keep screen on during alarm) ====================
// type-only shim so we don't depend on TS lib updates
interface WakeLockSentinelLike { released: boolean; release: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void }
interface NavigatorWakeLockLike { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }

async function acquireWakeLock(): Promise<WakeLockSentinelLike | null> {
  try {
    const nav = navigator as Navigator & NavigatorWakeLockLike
    if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') return null
    const sentinel = await nav.wakeLock.request('screen')
    console.log('[BG] Wake Lock adquirido')
    return sentinel
  } catch (e) {
    console.warn('[BG] Wake Lock no disponible:', e)
    return null
  }
}

async function releaseWakeLock(sentinel: WakeLockSentinelLike | null) {
  if (sentinel && !sentinel.released) {
    try { await sentinel.release() } catch (_e) { /* noop */ }
    console.log('[BG] Wake Lock liberado')
  }
}

// ==================== SYSTEM NOTIFICATION ====================
function showSystemNotification(title: string, body: string, requireInteraction = true) {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: 'guardian-sos-alarm',
      renotify: true,
      requireInteraction,
      vibrate: [200, 100, 200, 100, 400],
      silent: false,
    })
    n.onclick = () => { window.focus(); n.close() }
  } catch (e) { /* noop */ }
}

async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch (e) { return false }
}

// ==================== UNIQUE USER ID ====================
function getOrCreateUserId(): string {
  let userId = safeLocalStorage.getItem('guardian-user-id')
  if (!userId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let id = 'SOS-'
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    userId = id
    safeLocalStorage.setItem('guardian-user-id', userId)
  }
  return userId
}

// ==================== TYPES ====================
interface Contact {
  id: string
  name: string
  phone: string
  relation: string
  active: boolean
}

interface HistoryEntry {
  id: string
  timestamp: string
  latitude: number | null
  longitude: number | null
  contactsNotified: string[]
  triggerType: string
}

interface LicenseData {
  id: string
  key: string
  userId: string | null
  deviceName: string | null
  createdAt: string
  activatedAt: string | null
  active: boolean
}

interface GpsLocation {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
}

interface BleState {
  connected: boolean
  name: string | null
  rssi: number | null
  testDistance: number | null
}

interface LogEntry {
  id: string
  time: string
  message: string
  type: 'info' | 'success' | 'warning' | 'danger'
}

type TabType = 'monitor' | 'contacts' | 'history' | 'admin'

// ==================== MAIN COMPONENT ====================
export default function Page() {
  // ---- Hydration guard ----
  const [mounted, setMounted] = useState(false)

  // ---- URL / Watcher mode ----
  const [watcherMode, setWatcherMode] = useState(false)
  const [watcherUserId, setWatcherUserId] = useState('')
  const [watcherState, setWatcherState] = useState<{
    status: string
    latitude: number | null
    longitude: number | null
    accuracy: number | null
    notificationSteps: string[]
    victimName: string
    updatedAt: string
  } | null>(null)
  const [watcherSiren, setWatcherSiren] = useState(false)
  const [watcherAlertPending, setWatcherAlertPending] = useState(false)
  const [watcherAudioPlaying, setWatcherAudioPlaying] = useState(false)
  // ---- Guardian push-to-victim state ----
  const [pushTargetReachable, setPushTargetReachable] = useState<boolean | null>(null)
  const [pushSending, setPushSending] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [pushResult, setPushResult] = useState<{ success: boolean; text: string } | null>(null)


  // ---- User ID ----
  const [userId] = useState<string>(() => getOrCreateUserId())

  // ---- Tabs ----
  const [activeTab, setActiveTab] = useState<TabType>('monitor')

  // ---- License ----
    // ---- License ----
  const [isLicenseValid, setIsLicenseValid] = useState<boolean>(false)  // Start as false to show license screen first
  const [licenseChecking, setLicenseChecking] = useState(false)  // Start as false to avoid loading screen
  const [licenseKeyInput, setLicenseKeyInput] = useState('')
  const [licenseError, setLicenseError] = useState('')
  const [licenseActivating, setLicenseActivating] = useState(false)

  // ---- Admin (with loading state!) ----
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [adminPinInput, setAdminPinInput] = useState('')
  const [adminError, setAdminError] = useState('')
  const [validatedAdminPin, setValidatedAdminPin] = useState('')
  const [adminLicenses, setAdminLicenses] = useState<LicenseData[]>([])
  const [adminLicensesLoading, setAdminLicensesLoading] = useState(false)
  const [newLicenseKey, setNewLicenseKey] = useState('')
  const [newLicenseCreating, setNewLicenseCreating] = useState(false)
  const [newLicenseError, setNewLicenseError] = useState('')
  const [dbSetupLoading, setDbSetupLoading] = useState(false)
  const [dbSetupMessage, setDbSetupMessage] = useState('')
  const [changePinCurrent, setChangePinCurrent] = useState('')
  const [changePinNew, setChangePinNew] = useState('')
  const [changePinMessage, setChangePinMessage] = useState('')
  const [changePinLoading, setChangePinLoading] = useState(false)
  const [showAdminFromActivation, setShowAdminFromActivation] = useState(false)
  const [adminLoginLoading, setAdminLoginLoading] = useState(false)

  // ---- Contacts ----
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactRelation, setContactRelation] = useState('')

  // ---- History ----
  const [history, setHistory] = useState<HistoryEntry[]>([])

  // ---- Monitor ----
  const [location, setLocation] = useState<GpsLocation>({ latitude: null, longitude: null, accuracy: null })
  const [bleDevice, setBleDevice] = useState<BleState>({ connected: false, name: null, rssi: null, testDistance: null })
  const [bleConnecting, setBleConnecting] = useState(false)
  const [bleSupported, setBleSupported] = useState<boolean | null>(null)
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceKeyword, setVoiceKeyword] = useState('ayuda')
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceLastHeard, setVoiceLastHeard] = useState('')
  const [isTriggered, setIsTriggered] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [alarmActive, setAlarmActive] = useState(false)
  const [sirenMuted, setSirenMuted] = useState(false)
  const [enteredPin, setEnteredPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [shareLinkCopied, setShareLinkCopied] = useState(false)
  const [notificationSteps, setNotificationSteps] = useState<string[]>([])
  const [gpsErrorMessage, setGpsErrorMessage] = useState('')
  const [connectionLog, setConnectionLog] = useState<LogEntry[]>([])

  // ---- Refs ----
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const watcherIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const adminPinInputRef = useRef<HTMLInputElement>(null)
  const executeSosRef = useRef<() => void>(() => {})
  const bleDeviceRef = useRef<any>(null)
  const voiceRecognitionRef = useRef<any>(null)
  const voiceActiveRef = useRef(false)
  const voiceTriggeredRef = useRef(false)
  const voiceRetryCountRef = useRef(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const watcherAudioRef = useRef<HTMLAudioElement | null>(null)
  const watcherAudioIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastAudioChunkRef = useRef<string | null>(null)

  // ---- Background refs ----
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const bgLocationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasVoiceActiveBeforeHiddenRef = useRef(false)
  const alarmActiveRef = useRef(false)
  // Mirror voiceKeyword state into a ref so the visibilitychange handler
  // (which runs outside React's render cycle) can read the latest value.
  const voiceKeywordRef = useRef(voiceKeyword)
  useEffect(() => { voiceKeywordRef.current = voiceKeyword }, [voiceKeyword])
  // Keep alarmActiveRef in sync with the state (we set it directly in
  // executeSos / handleStopAlarm for immediate effect, but this ensures
  // consistency if the state ever changes from elsewhere).
  useEffect(() => { alarmActiveRef.current = alarmActive }, [alarmActive])


  // ==================== HELPER: ADD LOG ====================
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      type,
    }
    setConnectionLog((prev) => [entry, ...prev].slice(0, 50))
  }, [])

  // Set mounted after first render (hydration guard)
  useEffect(() => { setMounted(true) }, [])

  // ==================== BACKGROUND: VISIBILITY API + AUTO-RESUME ====================
  // When the user switches to another tab/app and comes back:
  //   - If voice was active before, restart recognition (browsers kill it on hide)
  //   - If alarm is active, re-acquire wake lock (it gets released on visibility change)
  //   - If alarm is active, keep the silent keep-alive audio running
  // Also warn the user when they leave during an active alarm.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        // Tab is being hidden - remember voice state
        wasVoiceActiveBeforeHiddenRef.current = voiceActiveRef.current
        if (alarmActiveRef.current) {
          addLog('App en segundo plano - alarma sigue activa', 'warning')
          // Try to keep the keep-alive running (works on desktop, partial on mobile)
          startBackgroundKeepAlive()
        }
      } else {
        // Tab is visible again
        if (alarmActiveRef.current) {
          addLog('App recuperada del segundo plano', 'success')
          // Re-acquire wake lock (it auto-releases on visibility change)
          if (!wakeLockRef.current || wakeLockRef.current.released) {
            acquireWakeLock().then((s) => { wakeLockRef.current = s })
          }
          // Restart siren if it died
          if (!sirenInterval) {
            try { startAlarmSound() } catch (_e) {}
          }
          // Restart keep-alive
          startBackgroundKeepAlive()
        }
        // Restart voice recognition if it was active before the tab was hidden.
        // Browsers kill the SpeechRecognition instance when the tab is backgrounded,
        // so we recreate it directly here (not via handleToggleVoice, which would
        // toggle off because voiceActive state is stale).
        if (wasVoiceActiveBeforeHiddenRef.current && !voiceRecognitionRef.current) {
          addLog('Reanudando reconocimiento de voz...', 'info')
          try {
            const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            if (SR) {
              voiceActiveRef.current = true
              const rec = new SR()
              rec.lang = 'es-ES'
              rec.continuous = true
              rec.interimResults = true
              rec.maxAlternatives = 3
              rec.onstart = () => { try { setVoiceListening(true) } catch(_e){} }
              rec.onresult = (ev: any) => {
                try {
                  for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const t = (ev.results[i][0].transcript || '').toLowerCase().trim()
                    try { setVoiceLastHeard(t) } catch(_e){}
                    if (!voiceTriggeredRef.current && t.includes(voiceKeywordRef.current.toLowerCase())) {
                      voiceTriggeredRef.current = true
                      addLog(`Voz: "${voiceKeywordRef.current}" detectada!`, 'danger')
                      setIsTriggered(true)
                      setCountdown(10)
                      setEnteredPin('')
                      setPinError('')
                    }
                  }
                } catch(_e){}
              }
              rec.onerror = (ev: any) => {
                if (!voiceActiveRef.current) return
                if (ev.error === 'aborted') return
                if (ev.error === 'no-speech' || ev.error === 'network' || ev.error === 'audio-capture') {
                  voiceRecognitionRef.current = null
                  if (voiceActiveRef.current && voiceRetryCountRef.current < 5) {
                    voiceRetryCountRef.current++
                    setTimeout(() => {
                      if (voiceActiveRef.current && !voiceRecognitionRef.current) {
                        try { rec.start() } catch(_e){}
                      }
                    }, 500)
                  }
                }
              }
              rec.onend = () => {
                if (voiceActiveRef.current && !voiceRecognitionRef.current) {
                  try { rec.start() } catch(_e){}
                }
              }
              voiceRecognitionRef.current = rec
              try { rec.start() } catch(_e){}
              setVoiceActive(true)
              addLog('Voz: Micrófono reactivado', 'success')
            }
          } catch (e) {
            addLog('Voz: No se pudo reactivar el micrófono', 'warning')
          }
        }
      }
    }

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (alarmActiveRef.current) {
        e.preventDefault()
        e.returnValue = 'Tienes una alerta S.O.S activa. ¿Seguro que quieres salir?'
        return e.returnValue
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [addLog])

  // ==================== BACKGROUND LOCATION SYNC ====================
  // While the alarm is active, push the current location to the server
  // every 15 seconds even if the GPS watchPosition callback is throttled
  // (mobile browsers throttle it when the tab is hidden). This ensures the
  // guardian's watcher mode always has fresh location data.
  useEffect(() => {
    if (alarmActive && isLicenseValid && !watcherMode) {
      // Start background location sync
      if (bgLocationIntervalRef.current) clearInterval(bgLocationIntervalRef.current)
      bgLocationIntervalRef.current = setInterval(() => {
        if (!alarmActiveRef.current) return
        if (location.latitude && location.longitude) {
          fetch('/api/alerts/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              status: 'TRIGGERED',
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
            }),
          }).catch(() => {})
        }
      }, 15000)
      addLog('Sincronización de ubicación en segundo plano activa (cada 15s)', 'info')
    } else {
      if (bgLocationIntervalRef.current) {
        clearInterval(bgLocationIntervalRef.current)
        bgLocationIntervalRef.current = null
      }
    }
    return () => {
      if (bgLocationIntervalRef.current) {
        clearInterval(bgLocationIntervalRef.current)
        bgLocationIntervalRef.current = null
      }
    }
  }, [alarmActive, isLicenseValid, watcherMode, userId, location, addLog])

  // ==================== INITIALIZATION ====================
  useEffect(() => {
    // Check for watcher mode
    const params = new URLSearchParams(window.location.search)
    const trackParam = params.get('track')
    if (trackParam) {
      setWatcherMode(true)
      setWatcherUserId(trackParam)
      setLicenseChecking(false)

      // --- Start guardian poll DIRECTLY here (no dependency on another useEffect) ---
      let wDestroyed = false
      let wAlertShown = false

      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }

      function wSendNotification(title: string, body: string) {
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const n = new Notification(title, { body, tag: 'guardian-sos-alert', requireInteraction: true })
            n.onclick = () => { window.focus(); n.close() }
          }
        } catch(_e) {}
      }

      async function wPollAudio() {
        if (wDestroyed) return
        try {
          const aRes = await fetch(`/api/alerts/audio?userId=${trackParam}`)
          const aData = await aRes.json()
          if (aData.success && aData.audio && aData.audio !== lastAudioChunkRef.current) {
            lastAudioChunkRef.current = aData.audio
            if (watcherAudioRef.current) {
              watcherAudioRef.current.src = aData.audio
              watcherAudioRef.current.play().catch(() => {})
            }
          }
        } catch(_e) {}
      }

      async function wPoll() {
        if (wDestroyed) return
        try {
          const res = await fetch(`/api/alerts/stream/${trackParam}`)
          console.log('[Guardián] Polling...', trackParam, 'HTTP', res.status)
          if (!res.ok) {
            console.warn('[Guardián] HTTP no OK:', res.status)
            return
          }
          const data = await res.json()
          console.log('[Guardián] Respuesta:', data)
          if (data.success && data.state) {
            setWatcherState(data.state)
            console.log('[Guardián] Estado recibido:', data.state.status, 'para userId:', data.state.userId)
            if (data.state.status === 'TRIGGERED' && !wAlertShown) {
              console.log('[Guardián] ¡ALERTA TRIGGERED detectada!')
              wAlertShown = true
              setWatcherAlertPending(true)
              setWatcherSiren(true)
              try { startAlarmSound() } catch(_e) {}
              try { if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]) } catch(_e) {}
              wSendNotification('ALERTA S.O.S', 'Se activo una alerta de emergencia. Abre para ver.')
              setWatcherAudioPlaying(true)
              lastAudioChunkRef.current = null
              if (watcherAudioIntervalRef.current) clearInterval(watcherAudioIntervalRef.current)
              wPollAudio()
              watcherAudioIntervalRef.current = setInterval(wPollAudio, 3000)
            }
            if (data.state.status !== 'TRIGGERED') {
              wAlertShown = false
              setWatcherAlertPending(false)
              setWatcherSiren(false)
              stopAlarmSound()
              setWatcherAudioPlaying(false)
              if (watcherAudioIntervalRef.current) {
                clearInterval(watcherAudioIntervalRef.current)
                watcherAudioIntervalRef.current = null
              }
              lastAudioChunkRef.current = null
            }
          } else {
            console.warn('[Guardián] Respuesta sin success o sin state:', data)
          }
        } catch (e) {
          console.error('[Guardián] Error en polling:', e)
        }
      }

      wPoll()
      watcherIntervalRef.current = setInterval(wPoll, 2500)

      // Check if the victim has push-enabled devices (so the guardian
      // knows whether the "wake up victim" button will actually work).
      // Use .then() because the enclosing useEffect is not async.
      fetch(`/api/push/send?targetUserId=${encodeURIComponent(trackParam)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setPushTargetReachable(d.reachable)
        })
        .catch(() => { /* noop */ })

      const wVis = () => {
        if (document.visibilityState === 'visible') {
          wPoll()
          if (wAlertShown) wPollAudio()
        }
      }
      document.addEventListener('visibilitychange', wVis)

      return () => {
        wDestroyed = true
        if (watcherIntervalRef.current) clearInterval(watcherIntervalRef.current)
        stopAlarmSound()
        if (watcherAudioIntervalRef.current) clearInterval(watcherAudioIntervalRef.current)
        document.removeEventListener('visibilitychange', wVis)
      }
    }

    // --- Normal app init (only if NOT in watcher mode) ---
        // --- Normal app init (only if NOT in watcher mode) ---
    async function init() {
      // Seed PIN first (with timeout) - do this in background
      try {
        const pinCtrl = new AbortController()
        const pinTimeout = setTimeout(() => pinCtrl.abort(), 5000)
        await fetch('/api/license/admin/init-pin', { method: 'POST', signal: pinCtrl.signal })
        clearTimeout(pinTimeout)
      } catch (e) { /* noop - will retry on admin login */ }

      // Check if there's a previously saved license in localStorage
      const savedLicense = typeof localStorage !== 'undefined' 
        ? localStorage.getItem('guardian_sos_license') 
        : null
      
      if (savedLicense) {
        // Verify the saved license with the server (max 3 attempts, 8s each)
        let licenseOk = false
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            setLicenseChecking(true)
            const ctrl = new AbortController()
            const timeout = setTimeout(() => ctrl.abort(), 8000)
            const res = await fetch('/api/license/check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ licenseKey: savedLicense }),  // <-- CORREGIDO: era userId
              signal: ctrl.signal,
            })
            clearTimeout(timeout)
            const text = await res.text()
            let data: any
            try { data = JSON.parse(text) } catch { data = { success: false } }
            if (data.success && data.active) {
              licenseOk = true
            } else {
              // License invalid or expired, remove from storage
              try { localStorage.removeItem('guardian_sos_license') } catch (e) { /* ignore */ }
              licenseOk = false
            }
            break
          } catch (e) {
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 2000))
              continue
            }
            licenseOk = false
          }
        }
        
        // Only update state after verification completes
        setIsLicenseValid(licenseOk)
        setLicenseChecking(false)
        
        if (licenseOk) {
          console.log('[License] Auto-validated saved license')
        } else {
          console.log('[License] Saved license invalid, showing license screen')
        }
      } else {
        // No saved license - keep showing license screen (already showing by default)
        console.log('[License] No saved license, showing license screen')
        setLicenseChecking(false)
      }
    }

    init()

    // Load contacts from localStorage
    const savedContacts = safeLocalStorage.getItem('guardian-contacts')
    if (savedContacts) {
      try { setContacts(JSON.parse(savedContacts)) } catch (e) { /* noop */ }
    }

    // Load history from localStorage
    const savedHistory = safeLocalStorage.getItem('guardian-history')
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)) } catch (e) { /* noop */ }
    }

    // Start GPS watch
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }
          setLocation(newLoc)
          setGpsErrorMessage('')

          // If alarm is active, continuously update guardian with new location
          if (alarmActive) {
            fetch('/api/alerts/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                status: 'TRIGGERED',
                latitude: newLoc.latitude,
                longitude: newLoc.longitude,
                accuracy: newLoc.accuracy,
              }),
            }).catch(() => {})
          }
        },
        (err) => {
          if (err.code === 1) {
            setGpsErrorMessage('Permiso de ubicación denegado')
            addLog('GPS: Permiso denegado', 'warning')
          } else {
            setGpsErrorMessage('Error al obtener ubicación')
            addLog('GPS: Error', 'danger')
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      )
    } else {
      setGpsErrorMessage('Geolocalización no soportada')
      addLog('GPS no disponible en este dispositivo', 'danger')
    }

    // Generate share link
    const baseUrl = window.location.origin + window.location.pathname
    setShareLink(baseUrl + '?track=' + userId)
    addLog('Aplicación iniciada', 'info')

    // ===== SYNC INITIAL SAFE STATE =====
    // Enviar estado SAFE al servidor para que el guardián sepa que estamos activos
    // y no vea "Esperando datos del usuario..."
    fetch('/api/alerts/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        status: 'SAFE',
        latitude: null,
        longitude: null,
        accuracy: null,
        notificationSteps: [],
        victimName: '',
      }),
    }).then((res) => res.json()).then((data) => {
      if (data.warning) {
        addLog('Base de datos no configurada - el guardián no recibirá alertas', 'warning')
      } else {
        addLog('Estado SAFE sincronizado - guardián puede monitorear', 'success')
      }
    }).catch(() => {
      addLog('Error al sincronizar estado inicial', 'warning')
    })

    // ===== PUSH SUBSCRIPTION (victim side) =====
    // Subscribe to push notifications so a guardian can wake this app
    // even when it's closed. Requires: service worker + notification
    // permission + a VAPID public key from the server.
    async function setupPushSubscription() {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          addLog('Push: No soportado en este navegador', 'warning')
          return
        }
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
          // Permission not granted yet - will retry after the user
          // interacts with the app (some browsers require a user gesture).
          return
        }
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          // Already subscribed - just sync to server in case it was lost
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, subscription: existing }),
          }).catch(() => {})
          addLog('Push: Dispositivo ya suscrito a alertas del guardián', 'success')
          return
        }
        // Fetch VAPID public key from server
        const keyRes = await fetch('/api/push/vapid-key')
        const keyData = await keyRes.json()
        if (!keyData.success || !keyData.publicKey) {
          // VAPID not configured - push notifications won't work, but app still functions
          addLog('Push: Claves VAPID no configuradas (opcional - para despertar app remota)', 'info')
          return
        }
        // Convert VAPID key to Uint8Array for subscribe()
        const applicationServerKey = Uint8Array.from(
          atob(keyData.publicKey.replace(/-/g, '+').replace(/_/g, '/')),
          (c) => c.charCodeAt(0)
        )
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
        // Send subscription to server
        const subRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            subscription: {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh') as ArrayBuffer))),
                auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth') as ArrayBuffer))),
              },
            },
          }),
        })
        const subData = await subRes.json()
        if (subData.success) {
          addLog('Push: Dispositivo suscrito - guardián puede enviar alertas', 'success')
        } else {
          addLog('Push: Error al registrar en el servidor', 'warning')
        }
      } catch (err) {
        console.warn('[Push] subscription error:', err)
        addLog('Push: No se pudo suscribir el dispositivo', 'warning')
      }
    }
    // Defer push subscription to avoid blocking initial render
    setTimeout(setupPushSubscription, 2500)

    // ===== Handle ?wakeup=1 query param (guardian pushed us) =====
    const wakeupParam = params.get('wakeup')
    if (wakeupParam) {
      const fromGuardian = params.get('from') || 'tu guardián'
      addLog(`Tu guardián (${fromGuardian}) te está contactando`, 'danger')
      try { if (navigator.vibrate) navigator.vibrate([300, 200, 300, 200, 300]) } catch (_e) {}
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const n = new Notification('🛡️ Tu guardián te busca', {
            body: `${fromGuardian} te está contactando. Toca para responder.`,
            icon: '/icon-192.png',
            tag: 'guardian-wakeup',
            requireInteraction: true,
          })
          n.onclick = () => { window.focus(); n.close() }
        }
      } catch (_e) {}
    }
  }, [userId, addLog])

  // ==================== SAVE CONTACTS ====================
  useEffect(() => {
    safeLocalStorage.setItem('guardian-contacts', JSON.stringify(contacts))
  }, [contacts])

  // ==================== SAVE HISTORY ====================
  useEffect(() => {
    safeLocalStorage.setItem('guardian-history', JSON.stringify(history))
  }, [history])

  // ==================== SOS COUNTDOWN ====================
  useEffect(() => {
    if (isTriggered && countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [isTriggered, countdown])

  // When countdown reaches 0, trigger alarm
  useEffect(() => {
    if (isTriggered && countdown === 0) {
      executeSosRef.current()
    }
  }, [isTriggered, countdown])

  // ==================== EXECUTE SOS ====================
  const executeSos = useCallback(() => {
    setAlarmActive(true)
    alarmActiveRef.current = true
    // NO sonar sirena en la app víctima - la víctima ya sabe que está en peligro
    // La sirena suena solo en la app del guardián (modo guardián)
    startAudioRecording()
    addLog('¡ALERTA S.O.S ACTIVADA!', 'danger')

    // ===== Background resilience: keep the app alive while alarm is active =====
    // 1) Wake Lock - prevent screen from sleeping
    acquireWakeLock().then((sentinel) => {
      wakeLockRef.current = sentinel
      if (sentinel) {
        addLog('Pantalla protegida (Wake Lock activo)', 'info')
        // Re-acquire if released (e.g. user switched tabs and came back)
        sentinel.addEventListener('release', () => {
          if (alarmActiveRef.current) {
            acquireWakeLock().then((s) => { wakeLockRef.current = s })
          }
        })
      }
    })
    // 2) Silent audio keep-alive - prevent tab suspension on mobile
    startBackgroundKeepAlive()
    // 3) System notification - so user sees alert even if in another app
    ensureNotificationPermission().then((granted) => {
      if (granted) {
        showSystemNotification(
          '🚨 ALERTA S.O.S ACTIVADA',
          'Guardian S.O.S está sonando. Toca para abrir y detener la alarma.',
          true
        )
        addLog('Notificación del sistema enviada', 'success')
      } else {
        addLog('Permiso de notificaciones denegado - alerta solo visible en la app', 'warning')
      }
    })

    const activeContacts = contacts.filter((c) => c.active)
    const steps: string[] = []

    steps.push(`[${new Date().toLocaleTimeString('es-MX')}] S.O.S activado`)

    if (location.latitude && location.longitude) {
      steps.push(`Ubicación: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`)
    } else {
      steps.push('Ubicación no disponible')
    }

    if (activeContacts.length > 0) {
      steps.push(`Notificando a ${activeContacts.length} contacto(s)...`)
      activeContacts.forEach((c) => {
        steps.push(`→ ${c.name} (${c.phone})`)
      })
    } else {
      steps.push('Sin contactos activos para notificar')
    }

    setNotificationSteps(steps)

    // Save to history
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      latitude: location.latitude,
      longitude: location.longitude,
      contactsNotified: activeContacts.map((c) => c.name),
      triggerType: 'Manual',
    }
    setHistory((prev) => [entry, ...prev])

    // Send alert to server for watcher + contacts
    const payload = {
      userId,
      status: 'TRIGGERED',
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      contactsNotified: activeContacts.map((c) => ({ name: c.name, phone: c.phone })),
      notificationSteps: steps,
      triggerType: 'Manual',
    }
    safeLocalStorage.setItem(`guardian-alert-state-${userId}`, JSON.stringify(payload))

    // 1) Sync alert state to DB so guardian monitoring link can pick it up
    console.log('[Víctima] Enviando estado TRIGGERED al servidor, userId:', userId, 'payload:', payload)
    fetch('/api/alerts/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(res => {
      console.log('[Víctima] Sync respondió HTTP', res.status)
      return res.json().then(data => {
        console.log('[Víctima] Sync respuesta:', data)
        if (res.ok && data.success) {
          if (data.warning) {
            addLog('⚠️ Base de datos no configurada en servidor', 'danger')
          } else {
            addLog('Estado TRIGGERED enviado al servidor ✓', 'success')
          }
        } else {
          addLog(`Error al sincronizar (HTTP ${res.status})`, 'danger')
        }
      })
    }).catch((err) => {
      console.error('[Víctima] Error de red en sync:', err)
      addLog('Error de conexión al sincronizar alerta', 'danger')
    })

    // 2) Generate military-grade share links for each selected contact
    //    (no SMS, no WhatsApp, no Twilio - just signed links the user shares)
    if (activeContacts.length > 0) {
      fetch('/api/alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          contacts: activeContacts.map((c) => ({ name: c.name, phone: c.phone })),
          location: location.latitude ? { latitude: location.latitude, longitude: location.longitude } : null,
          triggerType: 'Manual',
          reason: 'Alerta de emergencia activada por Guardian S.O.S',
        }),
      }).then(res => res.json()).then(async (data) => {
        if (!data.success) {
          addLog('Error al generar enlaces de alerta', 'danger')
          return
        }
        const links: Array<{ contact: string; phone: string; shareLink: string }> = data.shareLinks || []
        if (links.length === 0) {
          addLog('No se generaron enlaces (sin contactos válidos)', 'warning')
          return
        }

        addLog(`${links.length} enlace(s) militar(es) generado(s)`, 'success')

        // Build a single share payload that mentions all contacts + the
        // primary (first) signed link. On mobile this opens the native
        // share sheet so the user can pick SMS/email/Telegram/etc.
        const primary = links[0]
        const shareTitle = '🚨 ALERTA GUARDIAN S.O.S 🚨'
        const shareText =
          `Alerta de emergencia activada por ${userId}.\n` +
          (location.latitude
            ? `Ubicación: https://maps.google.com/?q=${location.latitude},${location.longitude}\n`
            : '') +
          `Enlace de monitoreo (válido 24h):\n${primary.shareLink}`
        const allLinksText = links
          .map((l) => `→ ${l.contact} (${l.phone}):\n${l.shareLink}`)
          .join('\n\n')

        // Try the Web Share API first (mobile / supported browsers)
        const nav: any = typeof navigator !== 'undefined' ? navigator : undefined
        if (nav && typeof nav.share === 'function') {
          try {
            await nav.share({ title: shareTitle, text: shareText, url: primary.shareLink })
            addLog('Enlace compartido via hoja nativa del dispositivo', 'success')
          } catch (err: any) {
            if (err && err.name === 'AbortError') {
              addLog('Compartir cancelado - enlace copiado al portapapeles', 'info')
            } else {
              addLog('Compartir no disponible - enlace copiado al portapapeles', 'warning')
            }
            // Fallback: copy primary link to clipboard
            try {
              await nav.clipboard?.writeText(primary.shareLink)
            } catch (_e) { /* noop */ }
          }
        } else if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
          // Desktop fallback: copy all links to clipboard
          try {
            await nav.clipboard.writeText(allLinksText)
            addLog(`${links.length} enlace(s) copiado(s) al portapapeles`, 'success')
          } catch (_e) {
            addLog('No se pudo copiar al portapapeles - revisa el registro', 'warning')
          }
        } else {
          addLog('Compartir no soportado en este navegador', 'warning')
        }

        // Always log every generated link so the user can copy them
        // manually from the connection log if all else fails.
        links.forEach((l) => {
          addLog(`Enlace militar → ${l.contact}: ${l.shareLink}`, 'info')
        })
      }).catch(() => {
        addLog('Error de conexion al generar enlaces', 'danger')
      })
    }
  }, [contacts, location, userId, addLog])

  executeSosRef.current = executeSos

  // ==================== LICENSE ACTIVATION ====================
  const handleActivateLicense = async () => {
    if (!licenseKeyInput.trim()) {
      setLicenseError('Ingresa una clave de licencia.')
      return
    }
    setLicenseActivating(true)
    setLicenseError('')
    try {
      const deviceName = `${typeof navigator !== 'undefined' && navigator.userAgent ? /Mobi|Android/i.test(navigator.userAgent) ? 'Móvil' : 'Escritorio' : 'Desconocido'} - ${typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 40) : 'N/A'}`
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKeyInput.trim(), userId, deviceName }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { data = { success: false, message: 'Respuesta inválida del servidor.' } }
            if (data.success) {
        // Save license to localStorage for future sessions
        try {
          localStorage.setItem('guardian_sos_license', licenseKeyInput.trim().toUpperCase())
        } catch (e) { /* ignore storage errors */ }
        setIsLicenseValid(true)
        setLicenseKeyInput('')
        setLicenseError('')
      } else {
        setLicenseError(data.message || 'Error al activar la licencia.')
      }
    } catch (e) {
      setLicenseError('Error de conexión. Espera un momento e intenta de nuevo.')
    } finally {
      setLicenseActivating(false)
    }
  }

  // ==================== ADMIN AUTH (ROBUST) ====================
  const handleAdminLoginRobust = async () => {
    let pinValue = adminPinInput.trim()
    if (!pinValue && adminPinInputRef.current) {
      pinValue = adminPinInputRef.current.value.trim()
    }
    if (!pinValue) {
      setAdminError('Ingresa el PIN de administrador.')
      return
    }

    setAdminLoginLoading(true)
    setAdminError('')

    // First ensure PIN is seeded in DB
    try {
      await fetch('/api/license/admin/init-pin', { method: 'POST' })
    } catch (e) { /* ignore */ }

    // Try up to 2 times with retry
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const ctrl = new AbortController()
        const timeout = setTimeout(() => ctrl.abort(), 10000)
        const res = await fetch('/api/license/admin/all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPin: pinValue }),
          signal: ctrl.signal,
        })
        clearTimeout(timeout)

        if (!res.ok) {
          // Server error - might be compiling, retry
          if (attempt < 2) { await new Promise(r => setTimeout(r, 1500)); continue }
          setAdminError(`Error del servidor (HTTP ${res.status}). Intenta de nuevo.`)
          break
        }

        const data = await res.json()
        if (data.success) {
          setIsAdminAuthenticated(true)
          setValidatedAdminPin(pinValue)
          setAdminLicenses(data.licenses || [])
          setAdminPinInput('')
          if (adminPinInputRef.current) adminPinInputRef.current.value = ''
          break
        } else {
          setAdminError(data.message || 'PIN incorrecto.')
          break
        }
      } catch (e) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1500))
          continue
        }
        setAdminError('Error de conexión al servidor. Verifica tu internet e intenta de nuevo.')
        break
      }
    }

    setAdminLoginLoading(false)
  }

  // ==================== ADMIN: LOAD LICENSES ====================
  const loadAdminLicenses = useCallback(async () => {
    if (!validatedAdminPin) return
    setAdminLicensesLoading(true)
    try {
      const res = await fetch('/api/license/admin/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: validatedAdminPin }),
      })
      const data = await res.json()
      if (data.success) {
        setAdminLicenses(data.licenses || [])
      }
    } catch (e) { /* noop */ }
    finally {
      setAdminLicensesLoading(false)
    }
  }, [validatedAdminPin])

  // ==================== ADMIN: CREATE LICENSE ====================
  const handleCreateLicense = async () => {
    setNewLicenseCreating(true)
    setNewLicenseError('')
    try {
      const res = await fetch('/api/license/admin/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: validatedAdminPin, key: newLicenseKey.trim() || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        setNewLicenseKey('')
        loadAdminLicenses()
      } else {
        setNewLicenseError(data.message || 'Error al crear licencia.')
      }
    } catch (e) {
      setNewLicenseError('Error de conexión.')
    } finally {
      setNewLicenseCreating(false)
    }
  }
  // ==================== ADMIN: SETUP DATABASE ====================
  const handleSetupDatabase = async () => {
    setDbSetupLoading(true)
    setDbSetupMessage('')
    try {
      const res = await fetch('/api/setup', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setDbSetupMessage('✅ Base de datos inicializada. PIN: ' + data.currentPin)
        loadAdminLicenses()
      } else {
        setDbSetupMessage('❌ Error: ' + data.message)
      }
    } catch (e) {
      setDbSetupMessage('❌ Error de conexión.')
    } finally {
      setDbSetupLoading(false)
    }
  }

  // ==================== ADMIN: UPDATE LICENSE ====================
  const handleUnbindLicense = async (licenseKey: string) => {

  // ==================== ADMIN: UPDATE LICENSE ====================
  const handleUnbindLicense = async (licenseKey: string) => {
    try {
      await fetch('/api/license/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: validatedAdminPin, licenseKey, unbind: true }),
      })
      loadAdminLicenses()
    } catch (e) { /* noop */ }
  }

  const handleToggleSuspendLicense = async (licenseKey: string, currentActive: boolean) => {
    try {
      await fetch('/api/license/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: validatedAdminPin, licenseKey, active: !currentActive }),
      })
      loadAdminLicenses()
    } catch (e) { /* noop */ }
  }

  const handleDeleteLicense = async (licenseKey: string) => {
    try {
      await fetch('/api/license/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: validatedAdminPin, licenseKey }),
      })
      loadAdminLicenses()
    } catch (e) { /* noop */ }
  }

  // ==================== ADMIN: CHANGE PIN ====================
  const handleChangePin = async () => {
    if (!changePinCurrent.trim() || !changePinNew.trim()) {
      setChangePinMessage('Completa ambos campos.')
      return
    }
    setChangePinLoading(true)
    setChangePinMessage('')
    try {
      const res = await fetch('/api/license/admin/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: changePinCurrent.trim(), newAdminPin: changePinNew.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setChangePinMessage('PIN actualizado exitosamente.')
        setChangePinCurrent('')
        setChangePinNew('')
        setValidatedAdminPin(changePinNew.trim())
      } else {
        setChangePinMessage(data.message || 'Error al cambiar PIN.')
      }
    } catch (e) {
      setChangePinMessage('Error de conexión.')
    } finally {
      setChangePinLoading(false)
    }
  }

  // ==================== CONTACTS ====================
  const handleAddContact = () => {
    if (!contactName.trim() || !contactPhone.trim()) return
    const newContact: Contact = {
      id: Date.now().toString(),
      name: contactName.trim(),
      phone: contactPhone.trim(),
      relation: contactRelation.trim() || 'Otro',
      active: true,
    }
    setContacts((prev) => [...prev, newContact])
    setContactName('')
    setContactPhone('')
    setContactRelation('')
  }

  const handleToggleContact = (id: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)))
  }

  const handleDeleteContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }

  // ==================== GPS REQUEST ====================
  const requestGps = () => {
    if (!navigator.geolocation) return
    setGpsErrorMessage('')
    addLog('Solicitando GPS...', 'info')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        addLog(`GPS obtenido: ±${Math.round(pos.coords.accuracy)}m`, 'success')
      },
      (err) => {
        if (err.code === 1) {
          setGpsErrorMessage('Permiso de ubicación denegado')
          addLog('GPS: Permiso denegado', 'warning')
        } else {
          setGpsErrorMessage('Error al obtener ubicación')
          addLog('GPS: Error de posicionamiento', 'danger')
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  // ==================== VOICE ACTIVATION SYSTEM (PERMANENT) ====================
  const handleToggleVoice = useCallback(() => {
    try {
      if (voiceActive) {
        // ---- DEACTIVATE ----
        voiceActiveRef.current = false
        voiceRetryCountRef.current = 0
        if (voiceRecognitionRef.current) {
          try { voiceRecognitionRef.current.abort() } catch (_e) { /* noop */ }
          try { voiceRecognitionRef.current.stop() } catch (_e) { /* noop */ }
          voiceRecognitionRef.current = null
        }
        setVoiceListening(false)
        setVoiceActive(false)
        addLog('Voz: Micrófono detenido', 'info')
      } else {
        // ---- ACTIVATE (permanent until manual stop) ----
        voiceActiveRef.current = true
        voiceRetryCountRef.current = 0
        voiceTriggeredRef.current = false
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SR) {
          voiceActiveRef.current = false
          addLog('Voz: No soportado en este navegador. Usa Chrome.', 'danger')
          return
        }

        function createAndStartRecognition() {
          if (!voiceActiveRef.current) return
          try {
            const rec = new SR()
            rec.lang = 'es-ES'
            rec.continuous = true
            rec.interimResults = true
            rec.maxAlternatives = 3
            rec.onstart = () => { try { setVoiceListening(true) } catch(_e){} }
            rec.onresult = (ev: any) => {
              try {
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                  const t = (ev.results[i][0].transcript || '').toLowerCase().trim()
                  try { setVoiceLastHeard(t) } catch(_e){}
                  if (!voiceTriggeredRef.current && t.includes(voiceKeyword.toLowerCase())) {
                    voiceTriggeredRef.current = true
                    addLog(`Voz: "${voiceKeyword}" detectada!`, 'danger')
                    setIsTriggered(true)
                    setCountdown(10)
                    setEnteredPin('')
                    setPinError('')
                  }
                }
              } catch(_e){}
            }
            rec.onerror = (ev: any) => {
              if (!voiceActiveRef.current) return
              if (ev.error === 'aborted') return
              // 'no-speech' and 'network' errors should also restart for permanent listening
              if (ev.error === 'no-speech') {
                // Silent restart for no-speech
                voiceRecognitionRef.current = null
                createAndStartRecognition()
                return
              }
              addLog(`Voz: Error ${ev.error} - reiniciando...`, 'warning')
              voiceRetryCountRef.current++
              // Instant restart on any error for permanent listening
              voiceRecognitionRef.current = null
              createAndStartRecognition()
            }
            rec.onend = () => {
              try { setVoiceListening(false) } catch(_e){}
              // Always restart immediately if voice is still active (permanent mode)
              if (voiceActiveRef.current) {
                voiceRetryCountRef.current++
                // Instant restart - no delay for permanent listening
                voiceRecognitionRef.current = null
                createAndStartRecognition()
              }
            }
            try {
              rec.start()
              voiceRecognitionRef.current = rec
              if (voiceRetryCountRef.current === 0) {
                addLog('Voz: Escuchando permanentemente...', 'info')
              }
            } catch(_e) {
              addLog('Voz: Error al iniciar, reintentando...', 'warning')
              setTimeout(() => {
                if (voiceActiveRef.current) {
                  createAndStartRecognition()
                }
              }, 1000)
            }
          } catch(err: any) {
            addLog(`Voz: ${err?.message || 'Error al crear instancia'}`, 'danger')
            // Retry with new instance after 1s
            setTimeout(() => {
              if (voiceActiveRef.current) createAndStartRecognition()
            }, 1000)
          }
        }

        createAndStartRecognition()
        setVoiceActive(true)
      }
    } catch (err: any) {
      addLog(`Voz: ${err?.message || 'Error'}`, 'danger')
    }
  }, [voiceActive, voiceKeyword, addLog])

  // Cleanup voice on unmount
  useEffect(() => {
    return () => {
      try { voiceRecognitionRef.current?.stop() } catch (_e) { /* noop */ }
    }
  }, [])

  // ==================== VOICE HEARTBEAT (ensure permanent listening) ====================
  useEffect(() => {
    if (!voiceActive) return
    const heartbeat = setInterval(() => {
      if (voiceActiveRef.current && !voiceListening) {
        // Recognition stopped but should be active - force restart
        voiceRecognitionRef.current = null
        try {
          const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          if (SR) {
            const rec = new SR()
            rec.lang = 'es-ES'
            rec.continuous = true
            rec.interimResults = true
            rec.maxAlternatives = 3
            rec.onresult = (ev: any) => {
              try {
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                  const t = (ev.results[i][0].transcript || '').toLowerCase().trim()
                  try { setVoiceLastHeard(t) } catch(_e){}
                  const kw = voiceKeyword.toLowerCase()
                  if (!voiceTriggeredRef.current && t.includes(kw)) {
                    voiceTriggeredRef.current = true
                    addLog(`Voz: "${voiceKeyword}" detectada!`, 'danger')
                    setIsTriggered(true)
                    setCountdown(10)
                    setEnteredPin('')
                    setPinError('')
                  }
                }
              } catch(_e){}
            }
            rec.onerror = (ev: any) => {
              if (!voiceActiveRef.current) return
              if (ev.error === 'aborted') return
              // Auto-restart on error for permanent listening
              setTimeout(() => {
                if (voiceActiveRef.current && !voiceListening) {
                  voiceRecognitionRef.current = null
                }
              }, 200)
            }
            rec.onend = () => {
              try { setVoiceListening(false) } catch(_e){}
              // Auto-restart immediately for permanent listening (don't wait for next heartbeat)
              if (voiceActiveRef.current) {
                voiceRecognitionRef.current = null
                setTimeout(() => {
                  if (voiceActiveRef.current && !voiceListening) {
                    try {
                      const SR2 = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
                      if (SR2) {
                        const r2 = new SR2()
                        r2.lang = 'es-ES'
                        r2.continuous = true
                        r2.interimResults = true
                        r2.maxAlternatives = 3
                        r2.onresult = (ev2: any) => {
                          try {
                            for (let j = ev2.resultIndex; j < ev2.results.length; j++) {
                              const tx = (ev2.results[j][0].transcript || '').toLowerCase().trim()
                              try { setVoiceLastHeard(tx) } catch(_e){}
                              if (!voiceTriggeredRef.current && tx.includes(voiceKeyword.toLowerCase())) {
                                voiceTriggeredRef.current = true
                                addLog(`Voz: "${voiceKeyword}" detectada!`, 'danger')
                                setIsTriggered(true)
                                setCountdown(10)
                                setEnteredPin('')
                                setPinError('')
                              }
                            }
                          } catch(_e){}
                        }
                        r2.onerror = () => {}
                        r2.onend = () => {
                          try { setVoiceListening(false) } catch(_e){}
                          if (voiceActiveRef.current) voiceRecognitionRef.current = null
                        }
                        r2.start()
                        voiceRecognitionRef.current = r2
                        try { setVoiceListening(true) } catch(_e){}
                      }
                    } catch(_e) {}
                  }
                }, 300)
              }
            }
            rec.start()
            voiceRecognitionRef.current = rec
            try { setVoiceListening(true) } catch(_e){}
          }
        } catch(_e) {}
      }
    }, 1000)
    return () => clearInterval(heartbeat)
  }, [voiceActive, voiceListening, voiceKeyword, addLog])

  // ==================== AUDIO RECORDING (SOS - Victim Side) ====================
  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream

      let mimeType = 'audio/webm;codecs=opus'
      if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4'
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''
          }
        }
      }

      const options: MediaRecorderOptions = {}
      if (mimeType) options.mimeType = mimeType

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          try {
            const reader = new FileReader()
            reader.onloadend = () => {
              const dataUri = reader.result as string
              if (dataUri) {
                fetch('/api/alerts/audio', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId, audio: dataUri }),
                }).catch(() => {})
              }
            }
            reader.readAsDataURL(e.data)
          } catch(_e) {}
        }
      }

      mediaRecorder.onerror = () => {
        addLog('Audio: Error en grabación', 'danger')
      }

      mediaRecorder.start(4000) // Send chunk every 4 seconds
      addLog('Audio: Grabación en vivo iniciada', 'success')
    } catch (e: any) {
      addLog(`Audio: ${e?.message || 'No se pudo iniciar grabación'}`, 'warning')
    }
  }, [userId, addLog])

  const stopAudioRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop() } catch(_e) {}
      mediaRecorderRef.current = null
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop())
      audioStreamRef.current = null
    }
  }, [])

  // ==================== WATCHER: VIEW ALERT (play siren + start audio) ====================
  const handleWatcherViewAlert = useCallback(() => {
    setWatcherAlertPending(false)
    setWatcherSiren(true)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    stopAlarmSound()
    startAlarmSound()
    // Warm up audio element during user gesture so play() works on mobile
    if (watcherAudioRef.current) {
      try {
        watcherAudioRef.current.load()
        watcherAudioRef.current.play().catch(() => {})
      } catch(_e) {}
    }
    // Start polling audio from victim
    setWatcherAudioPlaying(true)
    lastAudioChunkRef.current = null
    if (watcherAudioIntervalRef.current) clearInterval(watcherAudioIntervalRef.current)
    async function pollAudio() {
      try {
        const res = await fetch(`/api/alerts/audio?userId=${watcherUserId}`)
        const data = await res.json()
        if (data.success && data.audio && data.audio !== lastAudioChunkRef.current) {
          lastAudioChunkRef.current = data.audio
          if (watcherAudioRef.current) {
            watcherAudioRef.current.src = data.audio
            watcherAudioRef.current.play().catch(() => {})
          }
        }
      } catch(_e) {}
    }
    pollAudio()
    watcherAudioIntervalRef.current = setInterval(pollAudio, 3000)
  }, [watcherUserId])

  // ==================== WATCHER: STOP SIREN ====================
  const handleWatcherStopSiren = useCallback(() => {
    if (watcherSiren) {
      // Silenciar sirena pero mantener audio en vivo
      setWatcherSiren(false)
      stopAlarmSound()
      // NO detener el audio - el guardián quiere escuchar a la víctima
      // Solo detenemos la sirena, el audio sigue reproduciéndose
    } else {
      // Reactivar sirena
      setWatcherSiren(true)
      startAlarmSound()
    }
  }, [watcherSiren])

  // ==================== GUARDIAN PUSH-TO-VICTIM ====================
  // Check if the victim has any device subscribed to push notifications
  const checkPushReachable = useCallback(async (targetUserId: string) => {
    try {
      const res = await fetch(`/api/push/send?targetUserId=${encodeURIComponent(targetUserId)}`)
      const data = await res.json()
      if (data.success) {
        setPushTargetReachable(data.reachable)
      } else {
        setPushTargetReachable(false)
      }
    } catch (_e) {
      setPushTargetReachable(null)
    }
  }, [])

  // Send a push notification to wake up the victim's app
  const handleSendPushToVictim = useCallback(async (type: 'ping' | 'checkin' | 'alert' = 'ping') => {
    if (!watcherUserId) return
    setPushSending(true)
    setPushResult(null)
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: watcherUserId,
          type,
          guardianName: 'Guardián',
          body: pushMessage.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setPushResult({
          success: true,
          text: `✓ Push enviado a ${data.sent} dispositivo(s) de ${watcherUserId}. La app de la víctima debería despertar en segundos.`,
        })
        setPushMessage('')
        // Re-check reachability
        checkPushReachable(watcherUserId)
      } else {
        setPushResult({
          success: false,
          text: `✗ ${data.message || 'No se pudo enviar el push. La víctima debe abrir la app y aceptar notificaciones primero.'}`,
        })
      }
    } catch (_e) {
      setPushResult({ success: false, text: '✗ Error de conexión al enviar push.' })
    } finally {
      setPushSending(false)
      // Clear result after 8s
      setTimeout(() => setPushResult(null), 8000)
    }
  }, [watcherUserId, pushMessage, checkPushReachable])

  // ==================== BLUETOOTH CONNECTION ====================
  const handleConnectBluetooth = useCallback(async () => {
    try {
      const bt = (navigator as any)?.bluetooth
      if (!bt || typeof bt.requestDevice !== 'function') {
        addLog('BLE: Bluetooth no disponible. Usa Chrome/Edge.', 'danger')
        setBleSupported(false)
        return
      }
      setBleSupported(true)
      setBleConnecting(true)
      addLog('BLE: Buscando dispositivos...', 'info')

      const device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'generic_access', '0000180f-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb'],
      })

      if (!device || !device.id) {
        addLog('BLE: No se seleccionó dispositivo', 'warning')
        return
      }

      addLog(`BLE: ${device.name || 'Dispositivo'} seleccionado`, 'success')

      device.addEventListener('gattserverdisconnected', () => {
        try {
          setBleDevice({ connected: false, name: null, rssi: null, testDistance: null })
          bleDeviceRef.current = null
          addLog('BLE: Desconectado', 'warning')
        } catch(_e){}
      })

      // Mobile needs delay after device selection before GATT connect
      await new Promise<void>((resolve) => setTimeout(resolve, 1000))

      // Connect GATT with timeout
      const gatt = (device as any).gatt
      if (gatt && typeof gatt.connect === 'function') {
        const gattPromise = gatt.connect()
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de espera agotado (10s)')), 10000)
        )
        await Promise.race([gattPromise, timeoutPromise])
      }

      bleDeviceRef.current = device
      setBleDevice({ connected: true, name: device.name || 'BLE', rssi: null, testDistance: null })
      addLog(`BLE: Conectado a ${device.name || 'dispositivo'}`, 'success')

    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        addLog('BLE: Cancelado por el usuario', 'warning')
      } else {
        addLog(`BLE: ${err?.message || 'Error al conectar'}`, 'danger')
      }
      bleDeviceRef.current = null
      setBleDevice({ connected: false, name: null, rssi: null, testDistance: null })
    } finally {
      try { setBleConnecting(false) } catch(_e){}
    }
  }, [addLog])

  const handleDisconnectBluetooth = useCallback(() => {
    try {
      const dev = bleDeviceRef.current
      if (dev) {
        try {
          const gatt = (dev as any).gatt
          if (gatt && gatt.connected) {
            gatt.disconnect()
          }
        } catch(_e) { /* GATT disconnect may throw */ }
      }
    } catch(_e) {}
    bleDeviceRef.current = null
    setBleDevice({ connected: false, name: null, rssi: null, testDistance: null })
    addLog('BLE: Desconectado manualmente', 'info')
  }, [addLog])

  // ==================== BLE DISTANCE SIMULATION ====================
  const simulateBleDistance = (meters: number) => {
    if (meters === 0) {
      setBleDevice({ connected: true, name: 'GUARDIAN-BLE', rssi: -35, testDistance: 0 })
      addLog('BLE: Reconectado (0m)', 'success')
    } else {
      const rssi = -(30 + meters * 12)
      setBleDevice({
        connected: true,
        name: 'GUARDIAN-BLE',
        rssi,
        testDistance: meters,
      })
      addLog(`BLE: Distancia simulada → ${meters}m (RSSI: ${rssi})`, meters >= 2 ? 'warning' : 'info')

      if (meters >= 2) {
        // Trigger SOS automatically at 2m+
        if (!isTriggered && !alarmActive) {
          addLog(`BLE: ¡Distancia ${meters}m activa alarma!`, 'danger')
          setIsTriggered(true)
          setCountdown(10)
        }
      }
    }
  }

  // ==================== MANUAL SOS TRIGGER ====================
  const handleManualSos = () => {
    if (isTriggered || alarmActive) return
    addLog('S.O.S Manual solicitado - cuenta regresiva iniciada', 'warning')
    setIsTriggered(true)
    setCountdown(10)
    setEnteredPin('')
    setPinError('')
  }

  // ==================== CANCEL SOS (during countdown) ====================
  const handleCancelSos = () => {
    if (!enteredPin.trim()) {
      setPinError('Ingresa tu PIN de seguridad')
      return
    }
    if (enteredPin.trim() !== '1234') {
      setPinError('PIN incorrecto')
      setEnteredPin('')
      return
    }
    setIsTriggered(false)
    setCountdown(10)
    setEnteredPin('')
    setPinError('')
    addLog('S.O.S cancelado por PIN', 'info')
  }

  // ==================== STOP ALARM ====================
  const handleStopAlarm = () => {
    setAlarmActive(false)
    setSirenMuted(false)
    alarmActiveRef.current = false
    setIsTriggered(false)
    setCountdown(10)
    voiceTriggeredRef.current = false
    // No hay sirena en la app víctima, pero llamamos por si acaso
    stopAlarmSound()
    stopAudioRecording()
    // Release background resources
    stopBackgroundKeepAlive()
    releaseWakeLock(wakeLockRef.current)
    wakeLockRef.current = null
    if (bgLocationIntervalRef.current) {
      clearInterval(bgLocationIntervalRef.current)
      bgLocationIntervalRef.current = null
    }
    // Close any active system notification
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        // Closing by tag - re-showing a closed notification with same tag clears it
        const n = new Notification('Guardian S.O.S', {
          body: 'Alarma detenida',
          tag: 'guardian-sos-alarm',
          silent: true,
        })
        setTimeout(() => n.close(), 500)
      }
    } catch (_e) { /* noop */ }
    addLog('Alarma detenida', 'info')

    // Clear server state
    safeLocalStorage.removeItem(`guardian-alert-state-${userId}`)
    fetch('/api/alerts/cancel-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).catch(() => { /* noop */ })
  }

  // ==================== MUTE SIREN ONLY ====================
  // Silencia SOLO la sirena (sonido de alarma) para que el usuario
  // pueda escuchar el audio en vivo del guardián. Mantiene:
  //   - La alerta activa (sigue enviando ubicación al servidor)
  //   - La grabación de audio del micrófono
  //   - El Wake Lock (pantalla encendida)
  //   - El keep-alive (app en segundo plano)
  //   - El sync de ubicación cada 15s
  const handleToggleSirenMute = () => {
    if (sirenMuted) {
      // Re-activar sirena
      setSirenMuted(false)
      startAlarmSound()
      addLog('Sirena reactivada', 'info')
    } else {
      // Silenciar sirena
      setSirenMuted(true)
      stopAlarmSound()
      addLog('Sirena silenciada - audio en vivo disponible', 'info')
    }
  }

  // ==================== COPY SHARE LINK ====================
  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setShareLinkCopied(true)
      setTimeout(() => setShareLinkCopied(false), 2000)
    } catch (e) { /* noop */ }
  }

  // ==================== ADMIN LOGOUT ====================
  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false)
    setValidatedAdminPin('')
    setAdminLicenses([])
    setAdminError('')
    setShowAdminFromActivation(false)
  }

  // ==================== TAB ANIMATION VARIANTS ====================
  const tabVariants = {
    enter: { opacity: 0, y: 12, scale: 0.98 },
    center: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -12, scale: 0.98 },
  }

  // ==================== RELATION OPTIONS ====================
  const relationOptions = ['Familia', 'Amigo', 'Pareja', 'Compañero', 'Otro']

  // Hydration guard: prevent DOM mismatch on mobile (after ALL hooks)
  if (!mounted) {
    return <div className="min-h-screen bg-slate-950" />
  }

  // ==================== RENDER: WATCHER MODE (before license check!) ====================
  if (watcherMode) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="w-20 h-20 mx-auto mb-4 bg-amber-500/20 rounded-2xl flex items-center justify-center">
            <Eye className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Modo Guardián</h1>
          <p className="text-slate-400 mb-2">Monitoreando usuario:</p>
          <p className="text-amber-400 font-mono text-sm mb-6 bg-slate-800 px-3 py-1 rounded-lg inline-block">{watcherUserId}</p>

          {/* Connection status indicator */}
          <div className="mb-6 flex items-center justify-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${watcherState ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`}></span>
            <span className={watcherState ? 'text-emerald-400' : 'text-amber-400'}>
              {watcherState ? 'Conectado al servidor' : 'Conectando...'}
            </span>
          </div>

          {/* ===== ALERT PENDING - Big button to view alert + play siren ===== */}
          {watcherAlertPending && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6"
            >
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="bg-red-950/50 border-2 border-red-500 rounded-2xl p-8"
              >
                <div className="w-20 h-20 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                  <ShieldAlert className="w-10 h-10 text-red-500" />
                </div>
                <p className="text-red-400 font-bold text-2xl mb-2">¡ALERTA S.O.S!</p>
                <p className="text-slate-300 text-sm mb-6">Se ha activado una alerta de emergencia</p>
                <button
                  onClick={handleWatcherViewAlert}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-xl text-white font-bold text-lg transition-colors shadow-lg shadow-red-600/30 flex items-center justify-center gap-2"
                >
                  <Volume2 className="w-6 h-6" />
                  VER ALERTA Y UBICACIÓN
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ===== ALERT VIEWED - Show details + audio live ===== */}
          {watcherState && !watcherAlertPending && watcherState.status === 'TRIGGERED' && (
            <div className="space-y-4">
              {/* Silence Siren / Listen to Audio Button */}
              <button
                onClick={handleWatcherStopSiren}
                className="w-full py-4 bg-violet-600 hover:bg-violet-700 rounded-xl text-white font-bold transition-colors flex items-center justify-center gap-2 text-lg shadow-lg shadow-violet-600/30"
              >
                {watcherSiren ? (
                  <>
                    <VolumeX className="w-6 h-6" />
                    SILENCIAR SIRENA (escuchar audio)
                  </>
                ) : (
                  <>
                    <Volume2 className="w-6 h-6" />
                    REACTIVAR SIRENA
                  </>
                )}
              </button>

              <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-5 text-left space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Estado</span>
                  <Badge variant="destructive">¡ALERTA ACTIVA!</Badge>
                </div>

                {/* Audio Live Indicator */}
                {watcherAudioPlaying && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <Radio className="w-4 h-4 text-red-400 animate-pulse" />
                    <span className="text-red-400 text-xs font-medium">Audio en vivo</span>
                  </div>
                )}

                {watcherState.latitude && watcherState.longitude && (
                  <div>
                    <span className="text-slate-400 text-sm">Ubicación</span>
                    <a
                      href={`https://www.google.com/maps?q=${watcherState.latitude},${watcherState.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
                    >
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="flex-1">{watcherState.latitude.toFixed(6)}, {watcherState.longitude.toFixed(6)}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </div>
                )}

                {watcherState.notificationSteps && watcherState.notificationSteps.length > 0 && (
                  <div>
                    <span className="text-slate-400 text-sm">Pasos de notificación</span>
                    <ul className="mt-1 space-y-1">
                      {watcherState.notificationSteps.map((step: string, i: number) => (
                        <li key={i} className="text-slate-300 text-xs flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="text-slate-500 text-xs pt-2 border-t border-slate-800">
                  Actualizado: {watcherState.updatedAt ? new Date(watcherState.updatedAt).toLocaleTimeString('es-MX') : 'N/A'}
                </div>
              </div>
            </div>
          )}

          {watcherState && watcherState.status !== 'TRIGGERED' && !watcherAlertPending && (
            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-emerald-400 font-semibold text-lg mb-1">Todo en orden</p>
              <p className="text-slate-400 text-sm">Sin alertas activas para este usuario</p>
              <p className="text-slate-500 text-xs mt-3">
                Monitoreando: {watcherUserId} · Actualizado: {watcherState.updatedAt ? new Date(watcherState.updatedAt).toLocaleTimeString('es-MX') : 'N/A'}
              </p>
            </div>
          )}

          {!watcherState && !watcherAlertPending && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                <Activity className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-slate-400 text-sm mb-1">Esperando datos del usuario...</p>
              <p className="text-slate-500 text-xs">La conexión se establece automáticamente</p>
            </div>
          )}

          {/* ===== GUARDIAN: SEND PUSH TO VICTIM ===== */}
          {!watcherAlertPending && (
            <div className="mt-6 bg-slate-900 border border-violet-500/30 rounded-2xl p-5 text-left">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-5 h-5 text-violet-400" />
                <h3 className="text-white font-semibold text-sm">Despertar dispositivo de la víctima</h3>
              </div>
              <p className="text-slate-400 text-xs mb-3">
                Envía una alerta push que abre la app del usuario aunque esté cerrada
                (requiere que el usuario haya aceptado notificaciones previamente).
              </p>

              {/* Reachability badge */}
              <div className="mb-3 flex items-center gap-2">
                {pushTargetReachable === null ? (
                  <span className="text-xs text-slate-500">Verificando dispositivos suscritos...</span>
                ) : pushTargetReachable ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    Víctima conectada a push
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-1">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                    Víctima sin dispositivos suscritos
                  </span>
                )}
              </div>

              {/* Optional message */}
              <input
                type="text"
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value)}
                placeholder="Mensaje opcional (ej: 'Llámame cuando puedas')"
                maxLength={120}
                className="w-full mb-3 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleSendPushToVictim('ping')}
                  disabled={pushSending}
                  className="py-2 px-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-xs font-medium transition-colors flex items-center justify-center gap-1"
                >
                  {pushSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                  Ping
                </button>
                <button
                  onClick={() => handleSendPushToVictim('checkin')}
                  disabled={pushSending}
                  className="py-2 px-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-xs font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Check-in
                </button>
                <button
                  onClick={() => handleSendPushToVictim('alert')}
                  disabled={pushSending}
                  className="py-2 px-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-xs font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Alerta
                </button>
              </div>

              {/* Result message */}
              {pushResult && (
                <div className={`mt-3 p-2.5 rounded-lg text-xs ${
                  pushResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/20 text-red-300'
                }`}>
                  {pushResult.text}
                </div>
              )}
            </div>
          )}

          <audio ref={watcherAudioRef} className="hidden" />
        </motion.div>
      </div>
    )
  }

  // ==================== RENDER: ACTIVATION SCREEN ====================
  if (licenseChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
          <p className="text-slate-400 text-lg">Verificando licencia...</p>
        </div>
      </div>
    )
  }

  if (!isLicenseValid && !(showAdminFromActivation && isAdminAuthenticated)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative">
        {/* Floating Admin Button */}
        <button
          onClick={() => setShowAdminFromActivation(true)}
          className="absolute top-4 right-4 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Admin
        </button>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-amber-500/20 rounded-2xl flex items-center justify-center">
              <Shield className="w-10 h-10 text-amber-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">GUARDIÁN S.O.S</h1>
            <p className="text-slate-400">Protección personal inteligente</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Activar Dispositivo</h2>
            <p className="text-slate-400 text-sm mb-4">Ingresa tu clave de licencia para comenzar</p>

            <input
              type="text"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
              placeholder="SOS-XXXX-XXXX-0000-0000"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />

            {licenseError && (
              <p className="text-red-400 text-sm mt-2">{licenseError}</p>
            )}

            <Button
              onClick={handleActivateLicense}
              disabled={licenseActivating || !licenseKeyInput.trim()}
              className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 rounded-xl h-auto text-base disabled:opacity-50"
            >
              {licenseActivating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Activando...
                </span>
              ) : (
                'Activar Licencia'
              )}
            </Button>
          </div>

          <button
            onClick={() => setShowAdminFromActivation(true)}
            className="w-full mt-4 text-center text-violet-400 hover:text-violet-300 text-sm font-medium py-3 transition-colors"
          >
            Acceso de Socio →
          </button>
        </motion.div>

        {/* Admin panel from activation screen */}
        <AnimatePresence>
          {showAdminFromActivation && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="fixed inset-0 bg-slate-950 z-50 overflow-y-auto"
            >
              <div className="p-4 max-w-md mx-auto">
                <button
                  onClick={() => { setShowAdminFromActivation(false); setAdminError('') }}
                  className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 py-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Volver
                </button>

                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-3 bg-violet-600/20 rounded-2xl flex items-center justify-center">
                    <Key className="w-8 h-8 text-violet-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Acceso de Administrador</h2>
                  <p className="text-slate-400 text-sm mt-1">Ingresa tu PIN de socio</p>
                </div>

                {/* ROBUST PIN INPUT - Plain HTML */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <label className="block text-sm text-slate-300 mb-2 font-medium">PIN de Administrador</label>
                  <input
                    ref={adminPinInputRef}
                    type="password"
                    inputMode="numeric"
                    value={adminPinInput}
                    onChange={(e) => { setAdminPinInput(e.target.value.replace(/[^0-9]/g, '')); setAdminError('') }}
                    placeholder="****"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={10}
                    className="w-full px-4 py-3.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-center text-2xl tracking-[0.3em] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />

                  {adminError && (
                    <p className="text-red-400 text-sm mt-2 text-center">{adminError}</p>
                  )}

                  <Button
                    onClick={handleAdminLoginRobust}
                    disabled={adminLoginLoading}
                    className="w-full mt-4 bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl h-auto text-base disabled:opacity-50"
                  >
                    {adminLoginLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Verificando...
                      </span>
                    ) : (
                      'Ingresar'
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ==================== RENDER: ADMIN PANEL FROM ACTIVATION (authenticated) ====================
  if (showAdminFromActivation && isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-4 max-w-lg mx-auto">
          <button
            onClick={() => { setShowAdminFromActivation(false); handleAdminLogout() }}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 py-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
          </button>
          {renderAdminPanel()}
        </div>
      </div>
    )
  }

  // ==================== RENDER: MAIN APP ====================
  return (
    <div className={`min-h-screen bg-slate-950 flex flex-col ${alarmActive ? 'alarm-pulse-border' : ''}`}
      style={alarmActive ? { animation: 'alarmBorderPulse 1s ease-in-out infinite' } : undefined}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-500/20 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">GUARDIÁN S.O.S</h1>
              <p className="text-[10px] text-slate-500 leading-tight">{userId}</p>
            </div>
          </div>
          {alarmActive && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 rounded-full"
            >
              <div className="w-2 h-2 bg-red-500 rounded-full" style={{ animation: 'pulseGlow 0.8s ease-in-out infinite' }} />
              <span className="text-red-400 text-xs font-bold">ALERTA</span>
            </motion.div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={tabVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'monitor' && renderMonitorTab()}
            {activeTab === 'contacts' && renderContactsTab()}
            {activeTab === 'history' && renderHistoryTab()}
            {activeTab === 'admin' && renderAdminTab()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800">
        <div className="max-w-lg mx-auto flex">
          {([
            { key: 'monitor' as TabType, icon: Activity, label: 'Monitor' },
            { key: 'contacts' as TabType, icon: Users, label: 'Contactos' },
            { key: 'history' as TabType, icon: Clock, label: 'Historial' },
            { key: 'admin' as TabType, icon: Settings, label: 'Admin' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] transition-colors relative ${
                activeTab === tab.key ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {activeTab === tab.key && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-500 rounded-full"
                />
              )}
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )

  // ==================== MONITOR TAB ====================
  function renderMonitorTab() {
    return (
      <div className="space-y-4">
        {/* Alarm Active Overlay */}
        {alarmActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ animation: 'sirenFlash 1s ease-in-out infinite' }}
            className="bg-red-950/50 border-2 border-red-500 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Volume2 className="w-6 h-6 text-red-400" />
                <span className="text-red-400 font-bold text-lg">¡ALARMA ACTIVA!</span>
              </div>
              <Badge variant="destructive" className="text-sm">SIRENA</Badge>
            </div>

            {notificationSteps.length > 0 && (
              <div className="bg-slate-900/80 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
                {notificationSteps.map((step, i) => (
                  <p key={i} className="text-slate-300 text-xs font-mono py-0.5">{step}</p>
                ))}
              </div>
            )}

            <Button
              onClick={handleStopAlarm}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl h-auto text-lg"
            >
              <StopCircle className="w-6 h-6 mr-2" />
              DETENER ALARMA
            </Button>
          </motion.div>
        )}

        {/* Countdown Overlay */}
        {isTriggered && !alarmActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-amber-950/50 border-2 border-amber-500 rounded-2xl p-6 text-center"
          >
            <p className="text-amber-400 font-semibold text-sm mb-2">S.O.S SE ACTIVARÁ EN</p>
            <motion.p
              key={countdown}
              initial={{ scale: 1.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="text-7xl font-black text-amber-500 my-4"
            >
              {countdown}
            </motion.p>
            <p className="text-slate-400 text-sm mb-1">Para cancelar, ingresa tu PIN de seguridad:</p>
            <p className="text-slate-500 text-xs mb-4">PIN por defecto: 1234</p>

            <input
              type="password"
              inputMode="numeric"
              value={enteredPin}
              onChange={(e) => { setEnteredPin(e.target.value.replace(/[^0-9]/g, '')); setPinError('') }}
              placeholder="****"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              className="w-full max-w-[200px] mx-auto block px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-center text-2xl tracking-[0.3em] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent mb-3"
            />

            {pinError && (
              <p className="text-red-400 text-sm mb-3">{pinError}</p>
            )}

            <Button
              onClick={handleCancelSos}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Cancelar S.O.S
            </Button>
          </motion.div>
        )}

        {/* Voice Activation Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${voiceActive ? 'bg-amber-500/20' : 'bg-slate-800'}`}>
              <Phone className={`w-5 h-5 ${voiceActive ? 'text-amber-400' : 'text-slate-400'}`} />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">Activación por Voz</h3>
              {voiceListening && (
                <p className="text-amber-400 text-xs flex items-center gap-1">
                  <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  Escuchando...
                </p>
              )}
            </div>
            {voiceActive && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30">
                Activo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={voiceKeyword}
              onChange={(e) => setVoiceKeyword(e.target.value)}
              placeholder="Palabra clave"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <button
              onClick={handleToggleVoice}
              disabled={false}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                voiceActive
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {voiceActive ? 'Detener' : 'Activar'}
            </button>
          </div>
          {voiceLastHeard && (
            <p className="text-slate-500 text-xs italic truncate">Escuchado: "{voiceLastHeard}"</p>
          )}
        </div>

        {/* Bluetooth Connection Status */}
        <div className={`bg-slate-900 border rounded-2xl p-5 transition-all ${
          bleDevice.connected ? 'border-emerald-500/30' : 'border-red-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center relative ${
              bleDevice.connected ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}>
              <Bluetooth className={`w-7 h-7 ${bleDevice.connected ? 'text-emerald-400' : 'text-red-400'}`} />
              {bleDevice.connected && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full"
                  style={{ animation: 'pulseGlow 2s ease-in-out infinite' }}
                />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold">Dispositivo BLE</h3>
                {bleConnecting ? (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando...
                  </Badge>
                ) : bleDevice.connected ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
                    <Wifi className="w-3 h-3 mr-1" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30">
                    <WifiOff className="w-3 h-3 mr-1" /> Desconectado
                  </Badge>
                )}
              </div>
              <p className="text-slate-400 text-sm mt-0.5">
                {bleDevice.connected
                  ? `${bleDevice.name || 'GUARDIAN-BLE'} • RSSI: ${bleDevice.rssi || 'N/A'} dBm`
                  : 'Esperando conexión del dispositivo...'
                }
              </p>
              {bleDevice.testDistance !== null && bleDevice.testDistance > 0 && (
                <p className={`text-sm font-semibold mt-1 ${bleDevice.testDistance >= 2 ? 'text-red-400' : 'text-slate-300'}`}>
                  Distancia simulada: {bleDevice.testDistance}m
                  {bleDevice.testDistance >= 2 && ' ⚠️'}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            {!bleDevice.connected ? (
              <button
                onClick={handleConnectBluetooth}
                disabled={bleConnecting}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {bleConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                {bleConnecting ? 'Conectando...' : 'Conectar Bluetooth'}
              </button>
            ) : (
              <button
                onClick={handleDisconnectBluetooth}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <WifiOff className="w-4 h-4" />
                Desconectar
              </button>
            )}
          </div>
        </div>

        {/* GPS Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-amber-400" />
              <h3 className="text-white font-semibold">GPS</h3>
            </div>
            {location.latitude && location.longitude ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Activo</Badge>
            ) : (
              <Badge variant="secondary" className="text-slate-400">Sin señal</Badge>
            )}
          </div>

          {location.latitude && location.longitude ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Latitud</p>
                  <p className="text-white font-mono text-sm">{location.latitude.toFixed(6)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Longitud</p>
                  <p className="text-white font-mono text-sm">{location.longitude.toFixed(6)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Precisión</p>
                  <p className="text-white text-sm">±{Math.round(location.accuracy || 0)} metros</p>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors"
                >
                  <MapPinned className="w-4 h-4" />
                  Maps
                </a>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <MapPin className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              {gpsErrorMessage ? (
                <p className="text-red-400 text-sm">{gpsErrorMessage}</p>
              ) : (
                <p className="text-slate-500 text-sm">Sin ubicación disponible</p>
              )}
              <Button
                onClick={requestGps}
                variant="outline"
                size="sm"
                className="mt-3 border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <MapPin className="w-4 h-4 mr-1.5" />
                Solicitar GPS
              </Button>
            </div>
          )}
        </div>

        {/* Distance Simulation */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Signal className="w-5 h-5 text-violet-400" />
            <h3 className="text-white font-semibold">Simulación de Distancia</h3>
          </div>
          <p className="text-slate-400 text-xs mb-4">Prueba la activación automática del S.O.S por distancia BLE</p>
          <div className="grid grid-cols-5 gap-2">
            <button
              onClick={() => simulateBleDistance(0)}
              className="flex flex-col items-center justify-center py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/20 transition-colors min-h-[60px]"
            >
              <span className="text-emerald-400 font-bold text-lg">0m</span>
              <span className="text-emerald-400/60 text-[9px] mt-0.5">Reconectar</span>
            </button>
            <button
              onClick={() => simulateBleDistance(1)}
              className="flex flex-col items-center justify-center py-3 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-700/50 transition-colors min-h-[60px]"
            >
              <span className="text-slate-300 font-bold text-lg">1m</span>
              <span className="text-slate-500 text-[9px] mt-0.5">Cerca</span>
            </button>
            <button
              onClick={() => simulateBleDistance(2)}
              className="flex flex-col items-center justify-center py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl hover:bg-amber-500/20 transition-colors min-h-[60px]"
            >
              <span className="text-amber-400 font-bold text-lg">2m</span>
              <span className="text-amber-400/60 text-[9px] mt-0.5">Alarma</span>
            </button>
            <button
              onClick={() => simulateBleDistance(3)}
              className="flex flex-col items-center justify-center py-3 bg-orange-500/10 border border-orange-500/30 rounded-xl hover:bg-orange-500/20 transition-colors min-h-[60px]"
            >
              <span className="text-orange-400 font-bold text-lg">3m</span>
              <span className="text-orange-400/60 text-[9px] mt-0.5">Lejos</span>
            </button>
            <button
              onClick={() => simulateBleDistance(5)}
              className="flex flex-col items-center justify-center py-3 bg-red-500/10 border border-red-500/30 rounded-xl hover:bg-red-500/20 transition-colors min-h-[60px]"
            >
              <span className="text-red-400 font-bold text-lg">5m</span>
              <span className="text-red-400/60 text-[9px] mt-0.5">Arrojar</span>
            </button>
          </div>
        </div>

        {/* Manual SOS Button */}
        {!isTriggered && !alarmActive && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleManualSos}
            className="w-full py-5 bg-red-600 hover:bg-red-700 rounded-2xl text-white font-black text-xl tracking-wider transition-colors flex items-center justify-center gap-3 shadow-lg shadow-red-600/20"
          >
            <ShieldAlert className="w-7 h-7" />
            ACTIVAR S.O.S MANUAL
          </motion.button>
        )}

        {/* Share Link */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Share2 className="w-5 h-5 text-cyan-400" />
            <h3 className="text-white font-semibold">Enlace de Guardián</h3>
          </div>
          <p className="text-slate-400 text-xs mb-3">Comparte este enlace para que alguien pueda monitorear tu estado</p>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3">
            <p className="text-slate-500 text-xs mb-1">Tu ID de usuario:</p>
            <p className="text-amber-400 font-mono text-sm">{userId}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareLink}
              className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-xs font-mono truncate"
            />
            <Button
              onClick={handleCopyShareLink}
              variant="outline"
              size="sm"
              className="shrink-0 border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {shareLinkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Connection Log */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-slate-400" />
              <h3 className="text-white font-semibold">Registro de Conexión</h3>
            </div>
            <button
              onClick={() => setConnectionLog([])}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              Limpiar
            </button>
          </div>
          {connectionLog.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">Sin eventos registrados</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {connectionLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-xs">
                  <span className="text-slate-600 font-mono shrink-0 mt-0.5">{entry.time}</span>
                  <span className={`${
                    entry.type === 'success' ? 'text-emerald-400' :
                    entry.type === 'warning' ? 'text-amber-400' :
                    entry.type === 'danger' ? 'text-red-400' :
                    'text-slate-400'
                  }`}>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ==================== CONTACTS TAB ====================
  function renderContactsTab() {
    return (
      <div className="space-y-4">
        {/* Add Contact Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-semibold">Agregar Contacto</h3>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Nombre"
              autoComplete="off"
              autoCorrect="off"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Teléfono (ej: +52 55 1234 5678)"
              autoComplete="off"
              autoCorrect="off"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <div className="flex gap-2 flex-wrap">
              {relationOptions.map((rel) => (
                <button
                  key={rel}
                  onClick={() => setContactRelation(contactRelation === rel ? '' : rel)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    contactRelation === rel
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {rel}
                </button>
              ))}
            </div>
            <Button
              onClick={handleAddContact}
              disabled={!contactName.trim() || !contactPhone.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 rounded-xl h-auto disabled:opacity-40"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Contacto
            </Button>
          </div>
        </div>

        {/* Contact Count */}
        <div className="flex items-center justify-between px-1">
          <p className="text-slate-400 text-sm">
            {contacts.length} contacto{contacts.length !== 1 ? 's' : ''}
          </p>
          <p className="text-slate-500 text-xs">
            {contacts.filter(c => c.active).length} activo{contacts.filter(c => c.active).length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Contact List */}
        {contacts.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Sin contactos</p>
            <p className="text-slate-500 text-sm mt-1">Agrega contactos de emergencia para que sean notificados durante una alerta S.O.S</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {contacts.map((contact) => (
              <motion.div
                key={contact.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`bg-slate-900 border rounded-xl p-4 transition-colors ${
                  contact.active ? 'border-slate-800' : 'border-slate-800/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    contact.active ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {contact.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium truncate">{contact.name}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-400 shrink-0">
                        {contact.relation}
                      </Badge>
                    </div>
                    <p className="text-slate-400 text-sm truncate">{contact.phone}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={contact.active}
                      onCheckedChange={() => handleToggleContact(contact.id)}
                    />
                    <button
                      onClick={() => handleDeleteContact(contact.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ==================== HISTORY TAB ====================
  function renderHistoryTab() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-semibold">Historial de Alertas</h3>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              className="text-slate-500 hover:text-red-400 text-xs transition-colors"
            >
              Limpiar todo
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <Clock className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Sin alertas registradas</p>
            <p className="text-slate-500 text-sm mt-1">Las alertas S.O.S activadas aparecerán aquí con detalles de ubicación y contactos notificados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry, index) => {
              const date = new Date(entry.timestamp)
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative bg-slate-900 border border-slate-800 rounded-2xl p-4"
                >
                  {/* Timeline dot */}
                  <div className="absolute -left-[5px] top-6 w-2.5 h-2.5 bg-red-500 rounded-full" />

                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-medium text-sm">
                        {date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-slate-400 text-xs">
                        {date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>
                    <Badge className={`text-xs ${
                      entry.triggerType === 'Manual' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                      'bg-red-500/20 text-red-400 border-red-500/30'
                    }`}>
                      {entry.triggerType === 'Manual' ? '🤚 Manual' : '📡 BLE'}
                    </Badge>
                  </div>

                  {/* Location */}
                  {entry.latitude && entry.longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-amber-400 text-xs hover:underline mb-2"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {entry.latitude.toFixed(6)}, {entry.longitude.toFixed(6)}
                    </a>
                  ) : (
                    <p className="text-slate-500 text-xs mb-2">Ubicación no disponible</p>
                  )}

                  {/* Contacts Notified */}
                  {entry.contactsNotified.length > 0 ? (
                    <div className="flex items-start gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {entry.contactsNotified.map((name, i) => (
                          <span key={i} className="text-slate-400 text-xs bg-slate-800 px-2 py-0.5 rounded-md">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs">Sin contactos notificados</p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ==================== ADMIN TAB (inline, not separate component to keep state) ====================
  function renderAdminTab() {
    if (!isAdminAuthenticated) {
      return (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto mb-3 bg-violet-600/20 rounded-2xl flex items-center justify-center">
              <Key className="w-8 h-8 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Panel de Administración</h2>
            <p className="text-slate-400 text-sm mt-1">Ingresa tu PIN de socio para acceder</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <label className="block text-sm text-slate-300 mb-2 font-medium">PIN de Administrador</label>

            {/* ROBUST PIN INPUT - Plain HTML input, NOT shadcn Input */}
            <input
              ref={adminPinInputRef}
              type="password"
              inputMode="numeric"
              value={adminPinInput}
              onChange={(e) => { setAdminPinInput(e.target.value.replace(/[^0-9]/g, '')); setAdminError('') }}
              placeholder="****"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              className="w-full px-4 py-3.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-center text-2xl tracking-[0.3em] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLoginRobust() }}
            />

            {adminError && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm mt-2 text-center"
              >
                {adminError}
              </motion.p>
            )}

            <Button
              onClick={handleAdminLoginRobust}
              disabled={adminLoginLoading}
              className="w-full mt-4 bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl h-auto text-base disabled:opacity-50"
            >
              {adminLoginLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verificando...
                </span>
              ) : (
                'Ingresar'
              )}
            </Button>
          </div>
        </div>
      )
    }

    // Authenticated admin panel
    return renderAdminPanel()
  }

  // ==================== ADMIN PANEL (shared) ====================
  function renderAdminPanel() {
    return (
      <div className="space-y-4">
        {/* Admin Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600/20 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-violet-400" />
            </div>
            <h2 className="text-lg font-bold text-white">Administración</h2>
          </div>
          <Button
            onClick={handleAdminLogout}
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-red-400"
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            Cerrar Sesión
          </Button>
        </div>
 
        {/* Database Setup Button - AGREGAR ESTO */}
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-white font-medium text-sm">Inicializar Base de Datos</p>
                <p className="text-blue-300/70 text-xs">Crea las tablas necesarias</p>
              </div>
            </div>
            <Button
              onClick={handleSetupDatabase}
              disabled={dbSetupLoading}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 h-auto py-2"
            >
              {dbSetupLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Inicializar'
              )}
            </Button>
          </div>
          {dbSetupMessage && (
            <p className={`text-xs mt-2 ${dbSetupMessage.includes('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
              {dbSetupMessage}
            </p>
          )}
        </div>

        {/* Create License */}

        {/* Create License */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-semibold">Crear Licencia</h3>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newLicenseKey}
              onChange={(e) => setNewLicenseKey(e.target.value.toUpperCase())}
              placeholder="Clave personalizada (opcional)"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
            />
            <Button
              onClick={handleCreateLicense}
              disabled={newLicenseCreating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 h-auto py-2.5 shrink-0"
            >
              {newLicenseCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          {newLicenseError && (
            <p className="text-red-400 text-xs mt-2">{newLicenseError}</p>
          )}
        </div>

        {/* License Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              <h3 className="text-white font-semibold">Licencias ({adminLicenses.length})</h3>
            </div>
            <Button
              onClick={loadAdminLicenses}
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white h-8 px-2"
            >
              <RefreshCw className={`w-4 h-4 ${adminLicensesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {adminLicensesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
            </div>
          ) : adminLicenses.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">No hay licencias creadas</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {adminLicenses.map((lic) => (
                <div
                  key={lic.id}
                  className="bg-slate-800/50 rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-amber-400 font-mono text-xs break-all">{lic.key}</p>
                    <Badge className={`shrink-0 text-[10px] ${
                      lic.active
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border-red-500/30'
                    }`}>
                      {lic.active ? 'Activa' : 'Suspendida'}
                    </Badge>
                  </div>

                  {lic.userId ? (
                    <div className="space-y-1 text-xs">
                      <p className="text-slate-400">
                        <span className="text-slate-500">Dispositivo:</span> {lic.userId}
                      </p>
                      {lic.activatedAt && (
                        <p className="text-slate-500">
                          Activada: {new Date(lic.activatedAt).toLocaleDateString('es-MX')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs">Sin dispositivo vinculado</p>
                  )}

                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-700/50">
                    {lic.userId && (
                      <button
                        onClick={() => handleUnbindLicense(lic.key)}
                        className="text-xs text-slate-400 hover:text-amber-400 px-2 py-1 rounded-md hover:bg-slate-700/50 transition-colors"
                      >
                        Desvincular
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleSuspendLicense(lic.key, lic.active)}
                      className={`text-xs px-2 py-1 rounded-md transition-colors ${
                        lic.active
                          ? 'text-slate-400 hover:text-orange-400 hover:bg-slate-700/50'
                          : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50'
                      }`}
                    >
                      {lic.active ? 'Suspender' : 'Reactivar'}
                    </button>
                    <button
                      onClick={() => handleDeleteLicense(lic.key)}
                      className="text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded-md hover:bg-slate-700/50 transition-colors ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Change PIN */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Key className="w-5 h-5 text-violet-400" />
            <h3 className="text-white font-semibold">Cambiar PIN</h3>
          </div>

          <div className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              value={changePinCurrent}
              onChange={(e) => setChangePinCurrent(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="PIN actual"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <input
              type="password"
              inputMode="numeric"
              value={changePinNew}
              onChange={(e) => setChangePinNew(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Nuevo PIN"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />

            {changePinMessage && (
              <p className={`text-sm ${changePinMessage.includes('exitosamente') ? 'text-emerald-400' : 'text-red-400'}`}>
                {changePinMessage}
              </p>
            )}

                       <Button
              onClick={handleChangePin}
              disabled={changePinLoading}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl h-auto disabled:opacity-50"
            >
              {changePinLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cambiando...
                </span>
              ) : (
                'Cambiar PIN'
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
