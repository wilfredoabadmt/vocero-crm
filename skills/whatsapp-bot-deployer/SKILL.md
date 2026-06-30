---
name: whatsapp-bot-deployer
description: Deploy a generic WhatsApp Cloud API bot template to Coolify. Use when the user asks to deploy, publish, configure, or troubleshoot a WhatsApp bot on Coolify with FastAPI, Postgres, OpenAI, GitHub, Meta webhook verification, public HTTPS domain, environment variables, and admin panel credentials.
---

# WhatsApp Bot Deployer

Deploy this template from local files to a public Coolify application that Meta can call.

## Inputs

Require these values before deploy:

```text
GITHUB_TOKEN
COOLIFY_URL
COOLIFY_TOKEN
COOLIFY_PROJECT_UUID
WHATSAPP_API_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WEBHOOK_DOMAIN
VERIFY_TOKEN
OPENAI_API_KEY
ADMIN_USER
ADMIN_PASSWORD
SESSION_SECRET
```

Optional:

```text
META_APP_SECRET
OPENAI_MODEL
QUALIFIED_CTA_URL
ENABLE_FOLLOW_UPS
FOLLOW_UP_MINUTES
```

Generate if absent:

```text
DATABASE_URL
RELOAD_TOKEN
```

## Workflow

1. Validate `.env` and do not print secrets.
2. Validate `prompts/system.md`; warn if placeholders remain.
3. Create a private GitHub repository and push the sanitized project.
4. Ensure the Coolify GitHub App can access the repository.
5. Provision Postgres in Coolify or ask the user for the internal `DATABASE_URL`.
6. Create a public Coolify application with:
   - FQDN: `WEBHOOK_DOMAIN`
   - Dockerfile path: `/Dockerfile`
   - Healthcheck path: `/health`
   - Port: `8000`
7. Add env vars to the app.
8. Deploy and wait for healthy status.
9. Test from the public domain:
   - `GET /health`
   - `GET /webhook?hub.mode=subscribe&hub.verify_token=VERIFY_TOKEN&hub.challenge=test`
10. Generate `META_SETUP.md` locally with Callback URL and Verify Token. Confirm it is ignored by git.

## Meta setup output

Tell the user to configure:

```text
Callback URL: WEBHOOK_DOMAIN/webhook
Verify Token: VERIFY_TOKEN
Webhook field: messages
```

## Safety

- Never commit `.env`, `.mcp.json`, `META_SETUP.md`, `execution/`, API keys, tokens, passwords, or private MCP config.
- Before any commit or push, run a secret scan.
- Keep this skill generic. Add external integrations only in private project variants.
