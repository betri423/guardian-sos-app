'use client'

import { useState } from 'react'

export default function Home() {
  const [license, setLicense] = useState('')
  const [isValid, setIsValid] = useState(false)

  const handleActivate = () => {
    if (license.trim()) {
      localStorage.setItem('license', license)
      setIsValid(true)
    }
  }

  if (!isValid) {
    return (
      <div style={{minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
        <div style={{maxWidth: '400px', width: '100%', background: '#1e293b', borderRadius: '16px', padding: '32px'}}>
          <h1 style={{color: 'white', fontSize: '24px', marginBottom: '8px'}}>GUARDIÁN S.O.S</h1>
          <p style={{color: '#94a3b8', marginBottom: '24px'}}>Ingresa tu licencia</p>
          
          <input
            type="text"
            value={license}
            onChange={(e) => setLicense(e.target.value.toUpperCase())}
            placeholder="SOS-XXXX-XXXX-0000-0000"
            style={{
              width: '100%',
              padding: '12px',
              background: '#334155',
              border: '1px solid #475569',
              borderRadius: '8px',
              color: 'white',
              fontSize: '16px',
              marginBottom: '16px',
              boxSizing: 'border-box'
            }}
          />
          
          <button
            onClick={handleActivate}
            style={{
              width: '100%',
              padding: '12px',
              background: '#f59e0b',
              border: 'none',
              borderRadius: '8px',
              color: 'black',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Activar Licencia
          </button>
          
          <button
            onClick={() => alert('Panel Admin - PIN: 9988')}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '12px',
              background: 'transparent',
              border: '1px solid #8b5cf6',
              borderRadius: '8px',
              color: '#8b5cf6',
              cursor: 'pointer'
            }}
          >
            Acceso Administrador →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight: '100vh', background: '#0f172a', color: 'white', padding: '20px'}}>
      <h1>✅ App Funcionando</h1>
      <p>Licencia activada: {license}</p>
      <button onClick={() => {localStorage.removeItem('license'); setIsValid(false)}} style={{marginTop: '20px', padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
        Cerrar Sesión
      </button>
    </div>
  )
}