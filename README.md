# Mercantia Admin Panel

Panel externo para gestionar las instancias de **Mercantia** (SaaS B2B). Cada cliente
es una instancia independiente desplegada en un VPS y expone una API admin propia
en `/api/admin/system/*` protegida por token + IP allowlist. Este panel centraliza
su gestión: alta de clientes, healthchecks, módulos, backups y branding.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (Radix primitives, Lucide icons)
- Prisma + PostgreSQL
- TanStack Query (lado cliente)
- Vitest + Testing Library (tests)

## Setup local

### 1. Dependencias

```bash
npm install
```

### 2. Base de datos

Asegúrate de tener PostgreSQL corriendo. La URL por defecto en `.env.example` apunta
a `localhost:5435/mercantia_admin` con usuario/clave `catalogo/catalogo`.

```bash
cp .env.example .env
# Edita DATABASE_URL si tu instalación es distinta
```

Genera el hash bcrypt de tu contraseña de admin y pégalo en `.env`:

```bash
npm run hash-password "miContraseñaSegura123"
# copia el hash a ADMIN_PASSWORD
```

Genera un `SESSION_SECRET` aleatorio:

```bash
# Linux/Mac
openssl rand -hex 32
# Windows PowerShell
[Convert]::ToBase64String((1..32 | %{Get-Random -Maximum 256}))
```

### 3. Migraciones

```bash
npm run prisma:migrate
npm run seed:admin   # opcional, registra panel.initialized
```

### 4. Arrancar el panel

```bash
npm run dev
# http://localhost:3010 → redirige a /login
```

## Cómo añadir un cliente

1. Entra al panel y ve a **Clientes**.
2. Pulsa **Añadir cliente**.
3. Rellena:
   - **Nombre**: identificador legible.
   - **Slug**: slug único (a-z, 0-9, guiones).
   - **API URL**: por ejemplo `https://cliente.mercantia.pro`.
   - **API Token**: token estático configurado en la API admin del tenant. Se cifra
     con AES-256-GCM antes de guardarlo en BD.
   - **Estado**: `active`, `trial` o `suspended`.
4. Tras crearlo, en la página del cliente verás el indicador de salud y los
   tabs (Módulos / Info / Backups / Branding / Operaciones). En esta fase 4.1 los
   tabs son contenedores: la lógica concreta llegará en fases siguientes.

Para verificar la conectividad sin abrir el navegador:

```bash
npm run test:tenant <slug>
```

## Despliegue

Este panel se desplegará en `panel.mercantia.pro` como otra app Next.js gestionada
con CloudPanel + PM2 + Nginx en el mismo VPS principal.

Pasos resumidos:

```bash
npm ci --omit=dev=false
npm run prisma:deploy
npm run build
npm run start    # puerto 3010
```

PM2 (ejemplo):

```bash
pm2 start "npm run start" --name mercantia-panel
pm2 save
```

Nginx debe terminar TLS y proxypassar `panel.mercantia.pro` al puerto `3010`.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión Postgres a `mercantia_admin` |
| `ADMIN_PASSWORD` | Hash bcrypt de la contraseña de acceso |
| `SESSION_SECRET` | Secret aleatorio (≥32 bytes) usado por HMAC + AES |
| `SESSION_MAX_AGE_HOURS` | Duración de sesión (default 12h) |
| `PANEL_URL` | URL pública del panel |

## Tests

```bash
npm run test            # vitest run
npm run test:watch
npm run typecheck
npm run test:predeploy  # typecheck + tests + build
```

## Estructura

```
app/
  (panel)/              rutas autenticadas con sidebar
    page.tsx            dashboard
    tenants/            CRUD de clientes
    backup-targets/     CRUD de targets SSH
    logs/               auditoría
  api/                  route handlers (auth + proxies a la API del tenant)
  login/                login público
components/
  ui/                   shadcn/ui (button, input, dialog, …)
  sidebar.tsx, …        componentes propios
hooks/
  use-toast.ts
  use-tenant-api.ts     hooks de TanStack Query → APIs internas
lib/
  api-client.ts         cliente para hablar con la API admin de cada tenant
  auth/                 sesión HMAC y middleware
  crypto.ts             cifrado AES-256-GCM para tokens
  db.ts                 cliente Prisma compartido
  validation/           esquemas zod
prisma/
  schema.prisma         Tenant / BackupTarget / BackupSync / OperationLog
scripts/                utilidades CLI
tests/                  vitest
```
