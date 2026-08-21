# guardian.sos - Sistema de Alerta Personal

## 📁 ESTRUCTURA DEL PROYECTO

```
guardian-sos-fresh/
├── app/                    ← CARPETA PRINCIPAL (en raíz)
│   ├── page.tsx            ← Tu aplicación
│   ├── layout.tsx
│   └── api/                ← 20 rutas API
├── components/ui/          ← 48 componentes
├── public/                 ← Archivos PWA
├── package.json            ← EN RAÍZ ✅
├── next.config.mjs         ← EN RAÍZ ✅
└── tsconfig.json
```

## 🚀 DEPLOY INMEDIATO EN VERCEL

### Paso 1: Subir a GitHub

```bash
# Descomprime guardian-sos-FRESH-READY.zip
# Abre CMD/Carpeta donde descomprimiste

cd guardian-sos-fresh

git init
git add .
git commit -m "guardian.sos v2.1.0 - Listo para deploy"
git branch -M main
git remote add origin https://github.com/betri423/guardian-sos.git
git push -u origin main
```

### Paso 2: Deploy en Vercel

1. Ve a **[vercel.com/new](https://vercel.com/new)**
2. Importa tu repositorio `guardian-sos`
3. **NO cambies nada** - Vercel detectará Next.js automáticamente
4. Click en **Deploy**

### Paso 3: Configurar Variables (Opcional)

En Vercel → Settings → Environment Variables:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Generar con: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | (mismo comando) |
| `VAPID_EMAIL` | `mailto:tucorreo@gmail.com` |

Luego redespliega.

## ✅ VERIFICACIÓN

El build debería mostrar:

```
✓ Compiled successfully
✓ Generating static pages (21/21)

Route (app)                              Size     First Load JS
┌ ○ /                                    58.8 kB         155 kB
├ ƒ /api/alerts/send                     0 B                0 B
└ ... (20 rutas más)
```

## 🎯 LISTO

Tu app estará en: `https://tu-proyecto.vercel.app`
"# guardian-sos-v2" 
"# guardian-sos-app" 
"# guardian-sos-v2" 
