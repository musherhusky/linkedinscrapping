# 🚀 Hallon + Apify Backend Integration

Backend modular y escalable para extraer datos de LinkedIn y enviarlos a Hallon.

## 📁 Estructura

```
hallon-apify-backend/
├── api/
│   └── process-apify-dataset.js    (Handler de Vercel)
├── lib/
│   ├── supabase.js                 (Cliente Supabase)
│   ├── logger.js                   (Sistema de logs)
│   ├── config.js                   (Configuración de usuario)
│   ├── database.js                 (Operaciones de BD)
│   ├── apify.js                    (Lógica de Apify)
│   ├── hallon.js                   (Lógica de Hallon)
│   └── orchestrator.js             (Orquestación)
├── package.json
├── vercel.json
├── .env.example
└── README.md
```

## 🔧 Setup Rápido

### 1. Clonar y instalar

```bash
git clone https://github.com/TU_USUARIO/hallon-apify-backend
cd hallon-apify-backend
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env.production
```

Llenar con tus valores:
- `SUPABASE_URL` - De Supabase → Settings → API
- `SUPABASE_SERVICE_KEY` - De Supabase → Settings → API
- `APIFY_TOKEN` - De Apify → Account
- `APIFY_ACTOR_ID` - Tu Actor ID
- `HALLON_TOKEN` - De Hallon
- `HALLON_SID` - Tu SID
- `HALLON_TEMA_ID` - Tu Tema ID

### 3. Deploy en Vercel

```bash
npm install -g vercel
vercel
```

## 📊 Cómo funciona

```
POST /api/process-apify-dataset?user_id=xxx

1. Obtiene configuración del usuario
2. Extrae empresas activas
3. Ejecuta Apify Actor
4. Deduplica posts
5. Envía a Hallon (si está habilitado)
6. Guarda histórico y logs
```

## 🧪 Test

```bash
curl -X POST "http://localhost:3000/api/process-apify-dataset?user_id=test-user"
```

## 📚 Librerías

- **supabase.js** - Cliente Supabase centralizado
- **logger.js** - Sistema de logs consistente
- **config.js** - Obtiene configuración del usuario
- **database.js** - Operaciones CRUD
- **apify.js** - Ejecuta Actor y obtiene datos
- **hallon.js** - Envía a Hallon o guarda localmente
- **orchestrator.js** - Orquesta todo el proceso

## 🔐 Seguridad

- RLS habilitado en Supabase
- Variables de entorno en Vercel (no en código)
- Logs detallados para auditoría
- Manejo robusto de errores

## 📝 Logs

```
🔍 DEBUG   - Información de debug
ℹ️ INFO    - Información general
✅ SUCCESS - Operación exitosa
⚠️ WARN    - Advertencias
❌ ERROR   - Errores
```

## 🚀 Para múltiples clientes

Solo necesitas agregar nuevos handlers en `api/`:

```javascript
// api/process-apify-cliente-2.js
import { processUser } from '../lib/orchestrator.js';

export default async (req, res) => {
  const result = await processUser(req.query.user_id);
  return res.json(result);
};
```

Toda la lógica reutilizable está en `lib/`.

## 🤝 Contribuir

1. Fork el repo
2. Crea una rama (`git checkout -b feature/algo-nuevo`)
3. Commit (`git commit -am 'Agrega algo nuevo'`)
4. Push (`git push origin feature/algo-nuevo`)
5. Abre un Pull Request

## 📄 Licencia

MIT
