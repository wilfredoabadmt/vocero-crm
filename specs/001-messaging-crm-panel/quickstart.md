# Quickstart: Panel de Mensajería con CRM

## Requisitos

- Node.js 22+, npm 10+
- Docker (para PostgreSQL local) o un PostgreSQL 16 accesible

## Desarrollo local

```bash
# 1. Dependencias (workspaces: server + web + e2e)
npm install

# 2. Base de datos local
docker compose up -d db

# 3. Variables de entorno
copy .env.example .env   # Windows (cp en Linux/macOS)
# Defaults de .env.example ya apuntan a la DB del compose y activan SIMULATION_MODE=true

# 4. Migraciones + seed (admin inicial + 4 etapas)
npm run db:migrate

# 5. Arrancar (server :3000 con proxy a Vite :5173)
npm run dev
```

Login inicial: `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env` (default `admin@panel.local` / `admin1234` — cambiar en producción).

### Probar con tráfico simulado

```bash
# Crear bandeja simulada conectada
curl -X POST localhost:3000/api/simulate/provisioning

# Inyectar un mensaje entrante
curl -X POST localhost:3000/api/simulate/incoming-message \
  -H "Content-Type: application/json" \
  -d '{"inbox_id":1,"from":"5215512345678","name":"Cliente Demo","type":"text","body":"Hola"}'

# Forzar conversación fuera de ventana de 24h
curl -X POST localhost:3000/api/simulate/incoming-message \
  -H "Content-Type: application/json" \
  -d '{"inbox_id":1,"from":"5215599999999","name":"Lead Frio","type":"text","body":"Info","timestamp_offset_hours":-25}'
```

## Pruebas

```bash
npm test            # Vitest (unit + integración; usa la DB del compose)
npm run e2e         # Playwright E2E (levanta build con SIMULATION_MODE=true)
```

## Despliegue en Coolify

1. **Crear recurso** → Docker Compose → apuntar al repo (el `docker-compose.yml` raíz ya define `app` + `db`).
2. **Variables de entorno** (Coolify → Environment):
   - `SESSION_SECRET` (aleatorio 32+ chars), `PROVISIONING_SECRET`, `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `PUBLIC_URL=https://panel.midominio.com`
   - `SIMULATION_MODE=false`
   - `POSTGRES_PASSWORD` (el compose deriva `DATABASE_URL`)
3. **Dominio + TLS**: asignar dominio al servicio `app` (puerto 3000); Coolify gestiona el certificado.
4. **Volúmenes persistentes**: `db-data` (Postgres) y `uploads` (`/data/uploads`) — ya declarados en el compose.
5. Deploy. Las migraciones y el seed corren automáticamente en el arranque; healthcheck en `/api/health`.

### Conexión del webhook real

- En la app de Meta del tech provider, el `override_callback_uri` de cada número onboardeado debe apuntar a `https://panel.midominio.com/api/webhooks/whatsapp` con el `WEBHOOK_VERIFY_TOKEN` configurado.
- El servidor del tech provider entrega credenciales a `POST https://panel.midominio.com/api/provisioning/whatsapp` con `Authorization: Bearer <PROVISIONING_SECRET>`.

## Estructura de scripts raíz

| Script | Acción |
|---|---|
| `npm run dev` | server (tsx watch) + web (vite) en paralelo |
| `npm run build` | build web → build server |
| `npm run db:migrate` | drizzle-kit migrate + seed idempotente |
| `npm test` | vitest en `server/` |
| `npm run e2e` | playwright en `e2e/` |
