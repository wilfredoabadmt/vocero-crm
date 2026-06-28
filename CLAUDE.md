<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-messaging-crm-panel/plan.md`

Related design artifacts (same directory): `spec.md` (requirements),
`research.md` (technical decisions), `data-model.md` (PostgreSQL schema),
`contracts/` (REST/WS API, WhatsApp integration, simulation mode),
`quickstart.md` (dev setup + Coolify deploy), `tasks.md` (task breakdown).

Stack: TypeScript monorepo (npm workspaces) — `server/` Fastify 5 + Drizzle +
PostgreSQL 16 + WebSocket, `web/` React 18 + Vite + Tailwind, `e2e/` Playwright.
UI language: Spanish. Run `npm run dev` (server :3000, web :5173).
<!-- SPECKIT END -->
