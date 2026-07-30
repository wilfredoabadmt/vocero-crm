# Prompt de implementación

Pega esto en Claude Code (o Cursor) **abierto en el repo de SaaS TOI**, con la
carpeta `port-agente-isp/` copiada dentro del repo o accesible en disco.

Está escrito en modo objetivo: describe la META y el criterio de aceptación, no
los pasos uno por uno. Deja que el agente descubra tu schema real — es
justamente lo que no puedo saber desde aquí.

---

```
OBJETIVO
Integrar un Agente de IA de WhatsApp para cobranza y soporte de primer nivel en
este CRM de ISP, dejándolo funcionando y verificado de punta a punta.

MATERIAL DE PARTIDA
En `port-agente-isp/` hay un port completo y probado de la sección Agente:
código, migración SQL, UI, 48 tests unitarios en verde y un guion E2E de 28
escenarios. Léelo COMPLETO antes de escribir una línea, empezando por
`port-agente-isp/README.md`.

No lo copies a ciegas: los archivos que tocan la base de datos están escritos
contra un schema SUPUESTO (subscriber, plan, invoice, payment, ticket) y llevan
marcas `⚠️ ADAPTAR`. Tu trabajo es mapearlos a mi schema real.

FASE 1 — DESCUBRIMIENTO (no escribas código todavía)
Recorre este repo y responde por escrito, con rutas de archivo y nombres de
columna reales:
1. ¿Cómo se llaman mis tablas de abonados, planes, facturas, pagos y tickets?
   ¿Qué columna guarda el teléfono del abonado y en qué formato (con '+', con
   lada, normalizado)?
2. ¿Cómo se llaman mis tablas de conversación y mensaje? ¿Qué campos tienen ya
   de los que el agente necesita: `last_inbound_at`, `ai_enabled`, `handoff_at`,
   `is_test`, tipo de mensaje, id del media de Meta?
3. ¿Dónde está la ingesta del webhook de WhatsApp y en qué punto exacto queda
   commiteado un mensaje entrante? Ese es el punto de enganche.
4. ¿Cómo envío un mensaje de texto hoy? Nombre de la función, firma, y cómo
   maneja la ventana de 24 horas.
5. ¿Tengo helper `scoped()` para multi-tenancy y helper `withAuth` para rutas?
   ¿Cuál es la forma exacta de la sesión?
6. ¿Tengo bus de eventos SSE? ¿Cómo se publica?
7. ¿Qué estados usa mi tabla de abonados para activo / suspendido / cortado /
   baja? ¿Y mi tabla de tickets para abierto / en proceso?

Preséntame ese mapeo como una tabla "campo del port → campo real mío" y
pregúntame SÓLO lo que no puedas deducir del código. Agrupa todas las preguntas
en un solo mensaje.

FASE 2 — PLAN
Con el mapeo confirmado, dime en qué orden vas a tocar los archivos y qué vas a
cambiar en cada uno. Marca explícitamente cualquier cosa del port que NO encaje
en mi arquitectura y propón la alternativa.

FASE 3 — IMPLEMENTACIÓN
Ejecuta el plan. Reglas no negociables:

· MULTI-TENANCY: toda query lleva organization_id vía scoped(). Sin excepciones.
· El agente NO puede reconectar ni cortar el servicio, aprobar pagos, condonar
  deuda ni procesar bajas. Esas acciones no deben existir en su repertorio.
  Si detectas que agregarlas "sería útil", NO las agregues: escala a humano.
· Un comprobante de pago SIEMPRE queda en estado de revisión humana.
· Las cifras de dinero y fechas que el agente afirme sólo pueden venir del
  estado de cuenta inyectado en el prompt, nunca del modelo.
· Toda salida del LLM pasa por Zod + extracción robusta + reintentos. Un hipo
  del proveedor jamás tumba el turno: termina en handoff, nunca en silencio.
· La migración debe ser idempotente (IF NOT EXISTS): se aplica al arrancar el
  contenedor y puede correr más de una vez.
· No introduzcas dependencias nuevas de runtime más allá del proveedor LLM.

FASE 4 — VERIFICACIÓN (esta fase no se delega en mí)
1. `pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde.
2. Adapta `port-agente-isp/tests/unit/agent-isp.test.ts` a mi estructura y
   déjalo pasando.
3. Corre el guion `port-agente-isp/tests/e2e/agente-isp.md` COMPLETO contra la
   app levantada, con datos de prueba reales (un abonado moroso, uno al
   corriente, un teléfono no registrado). Usa Playwright si está disponible, o
   simula los webhooks entrantes con curl.
4. Presta atención especial a estos cuatro, que son los que suelen fallar:
   - "no tengo internet" de un abonado CORTADO POR MORA no debe abrir ticket.
   - "somos 4 personas" no debe escalar a humano.
   - El mismo webhook procesado dos veces no debe duplicar comprobante ni promesa.
   - Con el proveedor de IA caído, la conversación debe terminar en handoff.
5. Si algo falla: diagnostica, corrige y vuelve a verificar tú mismo hasta
   verde. No me devuelvas una lista de "cosas que quedaron pendientes de probar".

ENTREGA
Cuando termines, dime:
- Qué archivos creaste y cuáles modificaste.
- El mapeo final de schema que usaste.
- El resultado real de cada escenario del guion E2E (no "debería funcionar").
- Qué quedó fuera y por qué.
```

---

## Variante corta (si sólo quieres el núcleo)

Si prefieres integrarlo tú y sólo quieres que el asistente haga el mapeo de
datos:

```
Lee `port-agente-isp/src/server/ai/account.ts` y `executors.ts`. Están escritos
contra un schema supuesto (subscriber, plan, invoice, payment, ticket). Mapea
cada query y cada insert a mi schema real de este repo, respetando scoped() para
multi-tenancy, y déjame los dos archivos listos para compilar. No cambies la
firma de las funciones exportadas ni agregues acciones nuevas al agente.
```

---

## El otro "prompt": el del propio agente

Ojo con la ambigüedad de la palabra. El prompt que el **agente** usa para hablar
con tus abonados no se pega en ningún lado: se construye en
`port-agente-isp/src/server/ai/prompts.ts`, en la función
`buildAgentSystemPrompt()`. Ahí están la identidad, los límites duros y el
playbook por escenario.

Para ver el texto exacto que recibe el modelo con tus datos:

```ts
import { buildAgentSystemPrompt } from "@/server/ai/prompts";
import { UNKNOWN_ACCOUNT } from "@/server/ai/account-context";

console.log(
  buildAgentSystemPrompt({ profile, kb, account: UNKNOWN_ACCOUNT })
);
```

Lo que el dueño del negocio edita desde la UI (`/agent`) es la parte variable:
nombre, tono, saludo, instrucciones, reglas de escalado, formas de pago y el
conocimiento. La parte de seguridad —los límites duros y el contrato de
salida— vive en el código y no se toca desde la interfaz. Es a propósito: no
quieres que un cambio de tono desde el panel pueda desactivar la regla de "no
condonas deuda".
