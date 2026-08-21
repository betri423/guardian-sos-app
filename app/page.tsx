'use client'

import { useState } from 'react'

export default function Home() {
  const [license, setLicense] = useState('')
  const [isValid, setIsValid] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [adminPin, setAdminPin] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminError, setAdminError] = useState('')
  
  // Admin states
  const [licenses, setLicenses] = useState([])
  const [newLicenseKey, setNewLicenseKey] = useState('')
  const [message, setMessage] = useState('')

  // Load saved license on mount
  if (typeof window !== 'undefined' && !isValid) {
    const saved = localStorage.getItem('guardian_license')
    if (saved) {
      setIsValid(true)
      setLicense(saved)
    }
  }

  // Generate license key
  const generateLicense = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const digits = '0123456789'
    let key = 'SOS-'
    for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length))
    key += '-'
    for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length))
    key += '-'
    for (let i = 0; i < 4; i++) key += digits.charAt(Math.floor(Math.random() * digits.length))
    key += '-'
    for (let i = 0; i < 4; i++) key += digits.charAt(Math.floor(Math.random() * digits.length))
    return key
  }

  const handleActivate = () => {
    if (license.trim()) {
      localStorage.setItem('guardian_license', license.trim().toUpperCase())
      setIsValid(true)
      setMessage('')
    } else {
      setMessage('Ingresa una licencia')
    }
  }

  const handleAdminLogin = () => {
    setAdminError('')
    if (adminPin === '9988') {
      setIsAdmin(true)
      setAdminError('')
      // Load licenses from localStorage
      const savedLicenses = localStorage.getItem('guardian_licenses')
      if (savedLicenses) {
        try {
          setLicenses(JSON.parse(savedLicenses))
        } catch (e) {}
      }
    } else {
      setAdminError('PIN incorrecto')
    }
  }

  const handleCreateLicense = () => {
    const key = newLicenseKey.trim().toUpperCase() || generateLicense()
    
    // Check if exists
    if (licenses.find(l => l.key === key)) {
      setMessage('La licencia ya existe')
      return
    }
    
    const newLicense = {
      key,
      createdAt: new Date().toLocaleDateString(),
      active: true,
      usedBy: null
    }
    
    const updated = [...licenses, newLicense]
    setLicenses(updated)
    localStorage.setItem('guardian_licenses', JSON.stringify(updated))
    setNewLicenseKey('')
    setMessage('✅ Licencia creada: ' + key)
  }

  const handleDeleteLicense = (key) => {
    const updated = licenses.filter(l => l.key !== key)
    setLicenses(updated)
    localStorage.setItem('guardian_licenses', JSON.stringify(updated))
  }

  const handleToggleLicense = (key) => {
    const updated = licenses.map(l => 
      l.key === key ? {...l, active: !l.active} : l
    )
    setLicenses(updated)
    localStorage.setItem('guardian_licenses', JSON.stringify(updated))
  }

  const handleLogout = () => {
    setShowAdmin(false)
    setIsAdmin(false)
    setAdminPin('')
    setAdminError('')
  }

  // ====== ADMIN LOGIN SCREEN ======
  if (showAdmin && !isAdmin) {
    return (
      <div style={{minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
        <div style={{maxWidth: '400px', width: '100%'}}>
          <button 
            onClick={() => setShowAdmin(false)}
            style={{background: 'transparent', border: 'none', color: '#94a3b8', marginBottom: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'}}
          >
            ← Volver
          </button>
          
          <div style={{background: '#1e293b', borderRadius: '16px', padding: '32px'}}>
            <h2 style={{color: 'white', fontSize: '20px', marginBottom: '24px', textAlign: 'center'}}>🔐 Acceso Administrador</h2>
            
            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="PIN de administrador"
              maxLength={10}
              style={{
                width: '100%',
                padding: '14px',
                background: '#334155',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: 'white',
                fontSize: '18px',
                textAlign: 'center',
                letterSpacing: '4px',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
            />
            
            {adminError && (
              <p style={{color: '#ef4444', fontSize: '14px', marginBottom: '12px', textAlign: 'center'}}>{adminError}</p>
            )}
            
            <button
              onClick={handleAdminLogin}
              style={{
                width: '100%',
                padding: '14px',
                background: '#8b5cf6',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              Ingresar
            </button>
            
            <p style={{color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '16px'}}>
              PIN por defecto: 9988
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ====== ADMIN PANEL ======
  if (showAdmin && isAdmin) {
    return (
      <div style={{minHeight: '100vh', background: '#0f172a', color: 'white', padding: '20px'}}>
        <div style={{maxWidth: '600px', margin: '0 auto'}}>
          {/* Header */}
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
            <h1 style={{fontSize: '24px'}}>⚙️ Panel Administrador</h1>
            <button 
              onClick={handleLogout}
              style={{background: '#ef4444', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer'}}
            >
              Cerrar Sesión
            </button>
          </div>

          {/* Message */}
          {message && (
            <div style={{background: message.includes('✅') ? '#065f46' : '#7f1d1d', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px'}}>
              {message}
            </div>
          )}

          {/* Create License */}
          <div style={{background: '#1e293b', borderRadius: '12px', padding: '20px', marginBottom: '20px'}}>
            <h3 style={{marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              ➕ Crear Licencia
            </h3>
            
            <div style={{display: 'flex', gap: '10px'}}>
              <input
                type="text"
                value={newLicenseKey}
                onChange={(e) => setNewLicenseKey(e.target.value.toUpperCase())}
                placeholder="Clave personalizada (opcional)"
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#334155',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  color: 'white',
                  fontFamily: 'monospace'
                }}
              />
              <button
                onClick={handleCreateLicense}
                style={{
                  padding: '10px 20px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Crear
              </button>
            </div>
          </div>

          {/* License List */}
          <div style={{background: '#1e293b', borderRadius: '12px', padding: '20px'}}>
            <h3 style={{marginBottom: '16px'}}>
              📋 Licencias ({licenses.length})
            </h3>
            
            {licenses.length === 0 ? (
              <p style={{color: '#64748b', textAlign: 'center', padding: '20px'}}>No hay licencias creadas</p>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto'}}>
                {licenses.map((lic) => (
                  <div key={lic.key} style={{background: '#334155', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                    <div>
                      <p style={{fontFamily: 'monospace', color: '#f59e0b', fontSize: '14px'}}>{lic.key}</p>
                      <p style={{color: '#64748b', fontSize: '12px'}}>Creada: {lic.createdAt}</p>
                    </div>
                    
                    <div style={{display: 'flex', gap: '6px'}}>
                      <button
                        onClick={() => handleToggleLicense(lic.key)}
                        style={{
                          padding: '6px 10px',
                          background: lic.active ? '#f59e0b' : '#64748b',
                          border: 'none',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        {lic.active ? 'Activa' : 'Inactiva'}
                      </button>
                      
                      <button
                        onClick={() => handleDeleteLicense(lic.key)}
                        style={{
                          padding: '6px 10px',
                          background: '#ef4444',
                          border: 'none',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Database Setup Info */}
          <div style={{background: '#1e3a5f', borderRadius: '12px', padding: '16px', marginTop: '20px', fontSize: '13px', color: '#93c5fd'}}>
            <strong>ℹ️ Modo Local:</strong> Las licencias se guardan en el navegador. Para persistencia completa, configura DATABASE_URL en Vercel.
          </div>
        </div>
      </div>
    )
  }

  // ====== LICENSE SCREEN ======
  if (!isValid) {
    return (
      <div style={{minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
        <div style={{maxWidth: '400px', width: '100%', background: '#1e293b', borderRadius: '16px', padding: '32px'}}>
          {/* Logo */}
          <div style={{textAlign: 'center', marginBottom: '24px'}}>
            <div style={{width: '64px', height: '64px', background: '#f59e0b20', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', fontSize: '32px'}}>
              🛡️
            </div>
            <h1 style={{color: 'white', fontSize: '28px', marginBottom: '8px'}}>GUARDIÁN S.O.S</h1>
            <p style={{color: '#94a3b8'}}>Protección personal inteligente</p>
          </div>

          {/* Form */}
          <div style={{marginBottom: '16px'}}>
            <label style={{color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '8px'}}>Clave de Licencia</label>
            <input
              type="text"
              value={license}
              onChange={(e) => setLicense(e.target.value.toUpperCase())}
              placeholder="SOS-XXXX-XXXX-0000-0000"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '14px',
                background: '#334155',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: 'white',
                fontSize: '18px',
                fontFamily: 'monospace',
                letterSpacing: '2px',
                textAlign: 'center',
                marginBottom: '12px',
                boxSizing: 'border-box'
              }}
            />
            
            {message && (
              <p style={{color: '#ef4444', fontSize: '14px'}}>{message}</p>
            )}
          </div>

          <button
            onClick={handleActivate}
            style={{
              width: '100%',
              padding: '14px',
              background: '#f59e0b',
              border: 'none',
              borderRadius: '8px',
              color: 'black',
              fontWeight: 'bold',
              fontSize: '16px',
              cursor: 'pointer',
              marginBottom: '12px'
            }}
          >
            Activar Licencia
          </button>

          <button
            onClick={() => setShowAdmin(true)}
            style={{
              width: '100%',
              padding: '12px',
              background: 'transparent',
              border: '1px solid #8b5cf6',
              borderRadius: '8px',
              color: '#8b5cf6',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Acceso de Socio →
          </button>
        </div>
      </div>
    )
  }

  // ====== MAIN APP ======
  return (
    <div style={{minHeight: '100vh', background: '#0f172a', color: 'white'}}>
      {/* Header */}
      <header style={{background: '#1e293b', padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
          <div style={{width: '36px', height: '36px', background: '#f59e0b20', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'}}>
            🛡️
          </div>
          <div>
            <h1 style={{fontSize: '16px', fontWeight: 'bold', margin: 0}}>GUARDIÁN S.O.S</h1>
            <p style={{fontSize: '11px', color: '#64748b', margin: 0}}>{license}</p>
          </div>
        </div>
        
        <button
          onClick={() => {localStorage.removeItem('guardian_license'); setIsValid(false); setLicense('');}}
          style={{background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'}}
        >
          Cerrar Sesión
        </button>
      </header>

      {/* Main Content */}
      <main style={{padding: '20px', maxWidth: '600px', margin: '0 auto'}}>
        <div style={{background: '#1e293b', borderRadius: '16px', padding: '24px', marginBottom: '20px', textAlign: 'center'}}>
          <div style={{fontSize: '48px', marginBottom: '16px'}}>✅</div>
          <h2 style={{fontSize: '24px', marginBottom: '8px'}}>Dispositivo Activado</h2>
          <p style={{color: '#94a3b8'}}>Tu licencia está vigente y funcionando correctamente.</p>
        </div>

        {/* Quick Actions */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
          <button style={{background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', color: 'white', cursor: 'pointer', textAlign: 'left'}}>
            <div style={{fontSize: '24px', marginBottom: '8px'}}>📍</div>
            <div style={{fontWeight: 'bold'}}>Ubicación</div>
            <div style={{fontSize: '12px', color: '#64748b'}}>GPS activo</div>
          </button>
          
          <button style={{background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', color: 'white', cursor: 'pointer', textAlign: 'left'}}>
            <div style={{fontSize: '24px', marginBottom: '8px'}}>📱</div>
            <div style={{fontWeight: 'bold'}}>Contactos</div>
            <div style={{fontSize: '12px', color: '#64748b'}}>0 guardias</div>
          </button>
          
          <button style={{background: '#dc2626', border: 'none', borderRadius: '12px', padding: '20px', color: 'white', cursor: 'pointer', gridColumn: 'span 2'}}>
            <div style={{fontSize: '24px', marginBottom: '8px', textAlign: 'center'}}>🚨</div>
            <div style={{fontWeight: 'bold', textAlign: 'center', fontSize: '18px'}}>ACTIVAR ALERTA S.O.S</div>
          </button>
        </div>
      </main>
    </div>
  )
}