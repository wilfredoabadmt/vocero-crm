# Feature Specification: Panel de Mensajería con CRM Multicanal

**Feature Branch**: `001-messaging-crm-panel`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Panel de mensajería con CRM multicanal, single-tenant, desplegable en VPS propio con Coolify. Objetivo: centralizar las conversaciones de un negocio. Conversaciones entrantes en tiempo real con respuesta desde el panel, etiquetado de leads, notas por conversación, gestión de usuarios (múltiples asesores), panel de configuración para conectar bandejas (WhatsApp vía onboarding embebido con tech provider; IG/FB/LinkedIn/correo en fase siguiente), vista Kanban de embudo con 4 etapas, respuestas automáticas por agentes de IA configurables en lenguaje natural (proveedor OpenRouter con API key del usuario, wizard de creación, carga de documentos como contexto), branding sobrio con modo claro profesional y modo oscuro. Ampliación: respeto de la ventana de 24 horas de Meta (fuera de ventana solo se puede responder con plantilla), creación y gestión de plantillas de mensaje de WhatsApp con excelente UX/UI, y producto verificable de extremo a extremo con payloads simulados de WhatsApp (calidad enterprise pero ligero, al estilo Chatwoot sin funciones innecesarias)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recibir y responder conversaciones en tiempo real (Priority: P1)

Un asesor del negocio abre el panel y ve la lista de conversaciones entrantes ordenadas por actividad reciente. Cuando un cliente escribe por WhatsApp, la conversación aparece (o se actualiza) en el panel en tiempo real, sin necesidad de recargar la página. El asesor abre la conversación, lee el historial completo de mensajes y responde directamente desde el panel; el cliente recibe la respuesta en su WhatsApp.

**Why this priority**: Es la razón de existir del producto — centralizar y atender las conversaciones del negocio. Sin esto, ninguna otra función aporta valor.

**Independent Test**: Con una bandeja ya conectada (o un emisor de eventos simulado), enviar un mensaje entrante y verificar que aparece en el panel sin recargar; responder desde el panel y verificar que el mensaje sale hacia el contacto. Entrega valor por sí solo como bandeja centralizada.

**Acceptance Scenarios**:

1. **Given** un asesor con sesión iniciada y una bandeja de WhatsApp conectada, **When** un cliente envía un mensaje a ese número, **Then** la conversación aparece o se reordena al tope de la lista en tiempo real con el contenido del mensaje y un indicador de no leído.
2. **Given** una conversación abierta en el panel, **When** el asesor escribe una respuesta y la envía, **Then** el mensaje se entrega al cliente por el canal de origen y queda registrado en el historial con su estado de envío.
3. **Given** dos asesores con el panel abierto, **When** llega un mensaje nuevo, **Then** ambos ven la actualización en tiempo real de forma consistente.
4. **Given** un mensaje entrante con imagen, audio o documento, **When** el asesor abre la conversación, **Then** puede visualizar o descargar el adjunto desde el panel.

---

### User Story 2 - Conectar un número de WhatsApp (Priority: P1)

Un administrador entra al panel de configuración, sección de bandejas, y elige "Conectar WhatsApp". El panel lo redirige a la web de onboarding del tech provider (`https://aishiagency.tech/embedded-whatsapp-coex?client=onboarded-client`), donde completa el flujo de registro embebido de su número. Al terminar el onboarding, el servidor del tech provider obtiene los identificadores del número onboardeado y el token temporal, lo intercambia por un token permanente y, dentro de una ventana de 1 a 180 segundos, envía los identificadores y el token al backend del panel; además redirige (override) los eventos de mensaje de ese número hacia el panel. El administrador regresa al panel y ve la bandeja conectada y lista para recibir mensajes.

**Why this priority**: Sin un canal conectado no entran conversaciones reales. Es prerequisito operativo de la US1 en producción.

**Independent Test**: Iniciar el flujo de conexión desde la configuración, completar el onboarding externo y verificar que el panel recibe y registra los identificadores y el token, marca la bandeja como conectada y comienza a recibir eventos de mensaje del número.

**Acceptance Scenarios**:

1. **Given** un administrador en la sección de bandejas, **When** elige conectar WhatsApp, **Then** el panel lo redirige a la URL de onboarding del tech provider con el parámetro de cliente correspondiente.
2. **Given** un onboarding completado en la web del tech provider, **When** el backend del panel recibe los identificadores del número y el token (dentro de la ventana de 1–180 segundos), **Then** la bandeja queda registrada como conectada, con sus credenciales almacenadas de forma segura, y visible en el listado de bandejas.
3. **Given** una bandeja recién conectada con el override de eventos activo, **When** el número recibe un mensaje, **Then** el evento llega al panel y genera/actualiza la conversación correspondiente.
4. **Given** que la entrega de identificadores y token nunca llega (expira la ventana) o falla, **When** el administrador vuelve al panel, **Then** ve la conexión como fallida o pendiente con la opción de reintentar el proceso.

---

### User Story 3 - Calificar leads con etiquetas y notas (Priority: P2)

Un asesor, dentro de una conversación, asigna una o más etiquetas al lead (por ejemplo "interesado", "presupuesto enviado") y registra notas internas sobre la conversación (acuerdos, contexto, próximos pasos). Las etiquetas y notas son visibles para todos los usuarios del panel y permiten filtrar la lista de conversaciones.

**Why this priority**: Convierte la bandeja en un CRM: sin calificación ni contexto compartido, los asesores no pueden dar seguimiento ordenado a los leads.

**Independent Test**: Sobre cualquier conversación existente, crear/asignar etiquetas y escribir notas; verificar que persisten, que otro usuario las ve y que el listado se puede filtrar por etiqueta.

**Acceptance Scenarios**:

1. **Given** una conversación abierta, **When** el asesor asigna una etiqueta existente o crea una nueva, **Then** la etiqueta queda asociada al lead y visible en la lista de conversaciones y en el detalle.
2. **Given** una conversación abierta, **When** el asesor agrega una nota interna, **Then** la nota queda registrada con autor y fecha, visible para los demás usuarios y nunca se envía al cliente.
3. **Given** varias conversaciones etiquetadas, **When** un usuario filtra por una etiqueta, **Then** la lista muestra solo las conversaciones cuyos leads tienen esa etiqueta.

---

### User Story 4 - Gestionar el embudo en vista Kanban (Priority: P2)

Un usuario abre la vista Kanban y ve el embudo de ventas con 4 etapas en columnas. Cada lead aparece como una tarjeta en la etapa en la que se encuentra. El usuario puede mover una tarjeta de una etapa a otra (arrastrar y soltar) y abrir la conversación del lead desde la tarjeta.

**Why this priority**: Da visibilidad del estado comercial de todos los leads y complementa la calificación de la US3; depende de que existan conversaciones/leads.

**Independent Test**: Con leads existentes, abrir la vista Kanban, verificar las 4 columnas, mover un lead de etapa y comprobar que el cambio persiste y se refleja para otros usuarios.

**Acceptance Scenarios**:

1. **Given** leads existentes en el sistema, **When** un usuario abre la vista Kanban, **Then** ve 4 columnas (etapas del embudo) con cada lead como tarjeta en su etapa actual.
2. **Given** la vista Kanban abierta, **When** el usuario arrastra una tarjeta a otra columna, **Then** la etapa del lead se actualiza de inmediato, persiste y se refleja para el resto de usuarios.
3. **Given** una tarjeta de lead, **When** el usuario la abre, **Then** accede al detalle/conversación de ese lead.

---

### User Story 5 - Respuestas automáticas con agentes de IA (Priority: P2)

Un administrador configura su API key de OpenRouter en el panel. Luego crea agentes de IA mediante un wizard que pregunta, en lenguaje natural, los aspectos clave del agente: nombre, propósito, personalidad/tono, instrucciones de comportamiento, información del negocio y modelo de lenguaje a usar (de los disponibles en OpenRouter). Opcionalmente carga documentos (catálogos, FAQ, políticas) de los que el agente extraerá contexto para responder. Puede crear agentes ilimitados y asignar cualquiera a cualquier conversación; uno de ellos se marca como agente por defecto y contesta automáticamente los mensajes entrantes. Cuando un asesor humano interviene en una conversación, la respuesta automática se pausa en esa conversación y el asesor puede reactivarla cuando quiera.

**Why this priority**: Es el diferenciador de automatización del producto, pero requiere que la mensajería (US1/US2) funcione primero.

**Independent Test**: Configurar una API key válida de OpenRouter, crear un agente con el wizard (incluyendo un documento), marcarlo como por defecto, enviar un mensaje entrante y verificar que el agente responde automáticamente usando el contexto del documento.

**Acceptance Scenarios**:

1. **Given** un administrador en configuración, **When** ingresa su API key de OpenRouter, **Then** el sistema la valida, la almacena de forma segura y habilita las funciones de IA.
2. **Given** una API key configurada, **When** el usuario completa el wizard de creación de agente (propósito, tono, instrucciones, modelo de OpenRouter, documentos opcionales), **Then** el agente queda creado y disponible para asignar.
3. **Given** un agente marcado como por defecto, **When** llega un mensaje entrante a una conversación sin intervención humana activa, **Then** el agente genera y envía una respuesta automática registrada en el historial como respuesta de IA.
4. **Given** un agente con documentos cargados, **When** un cliente pregunta algo cubierto por esos documentos, **Then** la respuesta del agente refleja la información de los documentos.
5. **Given** una conversación atendida automáticamente, **When** un asesor humano envía una respuesta manual, **Then** la respuesta automática se pausa para esa conversación hasta que un usuario la reactive.
6. **Given** una conversación, **When** un usuario le asigna un agente distinto al por defecto, **Then** las respuestas automáticas de esa conversación las genera el agente asignado.

---

### User Story 6 - Responder fuera de la ventana de 24 horas con plantillas (Priority: P2)

Un asesor abre una conversación cuyo último mensaje del cliente tiene más de 24 horas. El panel le indica claramente que la ventana de servicio de Meta está cerrada y que solo puede contactar al cliente con una plantilla aprobada. El compositor de mensajes se transforma: en lugar del campo de texto libre, ofrece un selector de plantillas con vista previa, donde el asesor elige la plantilla, completa sus variables y la envía. Si el cliente responde, la ventana se reabre y el asesor vuelve a escribir libremente.

**Why this priority**: Es una restricción dura de Meta: sin esto, los envíos fuera de ventana fallan y el negocio pierde la capacidad de recontactar leads. Es parte del núcleo de mensajería.

**Independent Test**: Simular una conversación cuyo último mensaje entrante supere las 24 horas, verificar que el panel bloquea el texto libre, exige plantilla, permite enviarla con variables, y que un nuevo mensaje entrante reabre la ventana.

**Acceptance Scenarios**:

1. **Given** una conversación con último mensaje entrante hace más de 24 horas, **When** el asesor la abre, **Then** el panel muestra de forma visible que la ventana está cerrada y el tiempo transcurrido, y deshabilita el envío de texto libre.
2. **Given** la ventana cerrada, **When** el asesor abre el selector de plantillas, **Then** ve solo plantillas aprobadas, con vista previa del contenido final al completar las variables, y puede enviarla.
3. **Given** una conversación con ventana cerrada y plantilla enviada, **When** el cliente responde, **Then** la ventana se reabre y el compositor vuelve al modo de texto libre.
4. **Given** una conversación con ventana abierta próxima a expirar, **When** el asesor la visualiza, **Then** el panel muestra el tiempo restante de la ventana.
5. **Given** una conversación con ventana cerrada y respuesta automática activa, **When** llega el momento en que un agente de IA respondería, **Then** el agente NO envía texto libre; la conversación queda marcada para atención humana.

---

### User Story 7 - Crear y gestionar plantillas de WhatsApp (Priority: P2)

Un administrador abre la sección de plantillas y crea una plantilla de mensaje de WhatsApp mediante una experiencia guiada de alta calidad: nombre, categoría, idioma, cuerpo con variables, y vista previa en vivo de cómo se verá el mensaje en WhatsApp. Al guardarla, la plantilla se envía a Meta para aprobación a través de la bandeja conectada, y el panel muestra su estado (pendiente, aprobada, rechazada) actualizándolo cuando Meta resuelve. Las plantillas aprobadas quedan disponibles en el selector del compositor.

**Why this priority**: Las plantillas son el único mecanismo para contactar fuera de ventana; sin gestión de plantillas, la US6 no es operable de forma autónoma por el negocio.

**Independent Test**: Crear una plantilla desde la sección de plantillas, verificar que se envía a aprobación por la bandeja conectada, que su estado se refleja en el panel y que al quedar aprobada aparece en el selector de plantillas del compositor.

**Acceptance Scenarios**:

1. **Given** un administrador en la sección de plantillas, **When** crea una plantilla con nombre, categoría, idioma, cuerpo y variables, **Then** ve una vista previa en vivo fiel al formato de WhatsApp antes de guardar.
2. **Given** una plantilla guardada, **When** el sistema la envía a aprobación de Meta por la bandeja correspondiente, **Then** la plantilla aparece en el listado con estado "pendiente" y el estado se actualiza (aprobada/rechazada) cuando Meta resuelve, incluyendo el motivo de rechazo si existe.
3. **Given** plantillas en distintos estados, **When** el usuario abre el selector de plantillas del compositor, **Then** solo las aprobadas son seleccionables para envío.
4. **Given** una plantilla con variables, **When** el asesor la selecciona para enviar, **Then** el panel solicita el valor de cada variable y muestra la vista previa final antes de enviar.

---

### User Story 8 - Gestionar usuarios del panel (Priority: P3)

Un administrador crea, edita y desactiva cuentas de usuario para los asesores del negocio. Cada usuario inicia sesión con sus propias credenciales. Los administradores acceden a la configuración (bandejas, agentes de IA, usuarios); los asesores atienden conversaciones, etiquetan, anotan y usan el Kanban.

**Why this priority**: Necesario para operar con un equipo, pero el producto es demostrable con un solo usuario administrador.

**Independent Test**: Como administrador, crear un usuario asesor; iniciar sesión con él y verificar que puede atender conversaciones pero no acceder a la configuración; desactivarlo y verificar que ya no puede ingresar.

**Acceptance Scenarios**:

1. **Given** un administrador en la sección de usuarios, **When** crea un nuevo usuario asesor con sus credenciales, **Then** el asesor puede iniciar sesión y atender conversaciones.
2. **Given** un usuario con rol asesor, **When** intenta acceder a la configuración del sistema (bandejas, usuarios, API key), **Then** el acceso es denegado.
3. **Given** un usuario activo, **When** el administrador lo desactiva, **Then** sus sesiones quedan invalidadas y no puede volver a ingresar.

---

### User Story 9 - Experiencia visual profesional con modo oscuro (Priority: P3)

Cualquier usuario del panel trabaja con una interfaz sobria, clara y profesional, y puede alternar entre modo claro y modo oscuro; su preferencia se recuerda entre sesiones.

**Why this priority**: Aporta calidad percibida y comodidad de uso, pero no bloquea ninguna capacidad funcional.

**Independent Test**: Alternar el modo oscuro desde el panel, verificar que toda la interfaz cambia de forma consistente y que la preferencia persiste al volver a iniciar sesión.

**Acceptance Scenarios**:

1. **Given** un usuario en el panel, **When** activa el modo oscuro, **Then** toda la interfaz cambia a la paleta oscura sin pérdida de legibilidad.
2. **Given** un usuario que activó el modo oscuro, **When** cierra sesión y vuelve a entrar, **Then** el panel conserva su preferencia.

---

### Edge Cases

- La entrega de identificadores y token tras el onboarding de WhatsApp no llega dentro de la ventana de 1–180 segundos: la bandeja queda en estado pendiente/fallido y el administrador puede reintentar la conexión sin duplicar bandejas.
- Llega un evento de mensaje para un número que no corresponde a ninguna bandeja registrada: el sistema lo descarta de forma segura y lo deja registrado para diagnóstico.
- La API key de OpenRouter es inválida, expira o agota su crédito: las respuestas automáticas fallan de forma silenciosa hacia el cliente (no recibe mensajes de error), la conversación queda marcada para atención humana y el panel muestra el error al administrador.
- El modelo seleccionado para un agente deja de estar disponible en OpenRouter: el sistema lo notifica y permite cambiar de modelo sin recrear el agente.
- Dos asesores responden la misma conversación a la vez: ambos mensajes se envían y el historial refleja el orden real; el panel muestra quién respondió cada mensaje.
- El canal rechaza un mensaje saliente: el panel marca el mensaje como fallido y muestra el motivo al asesor.
- La ventana de 24 horas expira mientras el asesor escribe: al intentar enviar, el sistema rechaza el texto libre, explica el motivo y ofrece el selector de plantillas sin perder el texto escrito.
- Una plantilla usada en el selector es rechazada o eliminada por Meta después de aprobada: el sistema actualiza su estado y deja de ofrecerla para envío.
- Plantilla con variables enviada con valores vacíos: el sistema bloquea el envío hasta completar todas las variables.
- No existe ninguna plantilla aprobada y la ventana está cerrada: el panel lo comunica claramente y guía al usuario a crear una plantilla.
- Desfase de reloj entre canal y servidor al calcular la ventana: el cálculo usa la marca de tiempo del evento del canal, con margen conservador (ante la duda, tratar la ventana como cerrada).
- Se elimina un agente de IA asignado a conversaciones: esas conversaciones pasan al agente por defecto; si se intenta eliminar el agente por defecto, el sistema exige designar otro antes (o desactivar la respuesta automática global).
- Se desactiva un usuario con conversaciones asignadas: las conversaciones permanecen accesibles para el resto del equipo.
- Carga de documentos no soportados o demasiado grandes en el wizard: el sistema rechaza el archivo indicando formatos y tamaño máximo permitidos.
- Pérdida temporal de conexión del navegador: al reconectar, el panel se resincroniza y muestra los mensajes que llegaron durante la desconexión.
- Mensajes entrantes simultáneos del mismo contacto: se agrupan en una única conversación sin duplicados.

## Requirements *(mandatory)*

### Functional Requirements

**Conversaciones y mensajería**

- **FR-001**: El sistema MUST mostrar las conversaciones entrantes en una lista ordenada por actividad más reciente, con actualización en tiempo real (sin recarga manual).
- **FR-002**: El sistema MUST agrupar todos los mensajes de un mismo contacto y canal en una única conversación con historial completo y persistente.
- **FR-003**: Los usuarios MUST poder responder a una conversación desde el panel y el mensaje MUST entregarse al contacto por el canal de origen.
- **FR-004**: El sistema MUST mostrar el estado de cada mensaje saliente (enviado, entregado o fallido, según lo informe el canal) y el autor de cada respuesta (asesor humano o agente de IA).
- **FR-005**: El sistema MUST soportar mensajes entrantes con adjuntos (imágenes, audio, video y documentos), permitiendo visualizarlos o descargarlos desde el panel.
- **FR-006**: El sistema MUST indicar visualmente las conversaciones con mensajes no leídos.
- **FR-007**: Los usuarios MUST poder buscar conversaciones por nombre o número del contacto y filtrarlas por etiqueta y por etapa del embudo.

**Conexión de bandejas (WhatsApp)**

- **FR-008**: El panel de configuración MUST permitir iniciar la conexión de un número de WhatsApp redirigiendo al usuario a la web de onboarding del tech provider (`https://aishiagency.tech/embedded-whatsapp-coex?client=onboarded-client`).
- **FR-009**: El backend del panel MUST exponer un punto de recepción seguro para que el servidor del tech provider entregue los identificadores del número onboardeado y el token permanente, aceptando la entrega dentro de la ventana de 1 a 180 segundos posterior al onboarding.
- **FR-010**: El sistema MUST registrar la bandeja como conectada al recibir credenciales válidas, almacenarlas de forma segura (nunca visibles en texto plano en la interfaz) y reflejar su estado (pendiente, conectada, fallida) en el panel.
- **FR-011**: El sistema MUST recibir los eventos de mensaje redirigidos (override) del número conectado y convertirlos en conversaciones y mensajes del panel.
- **FR-012**: El sistema MUST permitir conectar más de una bandeja de WhatsApp y MUST permitir desconectar una bandeja existente.
- **FR-013**: El sistema MUST descartar de forma segura los eventos de números no registrados, dejando registro para diagnóstico.

**Ventana de 24 horas y plantillas de WhatsApp**

- **FR-037**: El sistema MUST calcular por conversación el estado de la ventana de servicio de 24 horas de Meta a partir de la marca de tiempo del último mensaje entrante del contacto, y mostrarlo en el compositor (abierta con tiempo restante, o cerrada).
- **FR-038**: Cuando la ventana está cerrada, el sistema MUST bloquear el envío de mensajes de texto libre (tanto de asesores como de agentes de IA) y MUST ofrecer en su lugar el envío de plantillas aprobadas.
- **FR-039**: Los administradores MUST poder crear plantillas de mensaje de WhatsApp desde el panel mediante una experiencia guiada con vista previa en vivo: nombre, categoría, idioma, cuerpo con variables de posición y botones/encabezado cuando aplique.
- **FR-040**: El sistema MUST enviar cada plantilla creada a aprobación de Meta a través de la bandeja conectada correspondiente y MUST reflejar su ciclo de estado (pendiente, aprobada, rechazada con motivo, deshabilitada) en el listado de plantillas.
- **FR-041**: El selector de plantillas del compositor MUST ofrecer solo plantillas aprobadas, MUST exigir el valor de todas las variables antes de enviar y MUST mostrar la vista previa final del mensaje.
- **FR-042**: Un mensaje entrante nuevo del contacto MUST reabrir la ventana de 24 horas y devolver el compositor al modo de texto libre en tiempo real.
- **FR-043**: Si la ventana está cerrada y la respuesta automática está activa, el agente de IA MUST abstenerse de responder y el sistema MUST marcar la conversación para atención humana.

**CRM: leads, etiquetas, notas y embudo**

- **FR-014**: El sistema MUST crear automáticamente un lead por cada contacto nuevo que inicie una conversación, con su nombre y número disponibles del canal.
- **FR-015**: Los usuarios MUST poder crear etiquetas (con nombre y color) y asignar una o varias a cada lead, así como removerlas.
- **FR-016**: Los usuarios MUST poder registrar notas internas por conversación, con autor y fecha; las notas MUST ser visibles solo dentro del panel y nunca enviarse al contacto.
- **FR-017**: El sistema MUST ofrecer una vista Kanban del embudo con exactamente 4 etapas, mostrando cada lead como tarjeta en su etapa actual.
- **FR-018**: Los usuarios MUST poder mover leads entre etapas (arrastrar y soltar) y el cambio MUST persistir y reflejarse en tiempo real para los demás usuarios.
- **FR-019**: Los administradores MUST poder renombrar las 4 etapas del embudo para adaptarlas al negocio (la cantidad de etapas permanece fija en 4).
- **FR-020**: Todo lead nuevo MUST ingresar automáticamente a la primera etapa del embudo.

**Agentes de IA**

- **FR-021**: El sistema MUST permitir al administrador registrar su propia API key de OpenRouter, validarla y almacenarla de forma segura; todas las respuestas de IA MUST generarse a través de OpenRouter con esa clave.
- **FR-022**: Los usuarios MUST poder crear una cantidad ilimitada de agentes de IA mediante un wizard que recopile, en lenguaje natural, los aspectos clave de operación: nombre, propósito/rol, tono y personalidad, instrucciones de comportamiento, información del negocio y reglas de escalamiento a humano.
- **FR-023**: El wizard MUST permitir seleccionar el modelo de lenguaje del agente de entre los modelos disponibles en OpenRouter para la API key configurada.
- **FR-024**: El wizard MUST soportar la carga de documentos como base de conocimiento del agente, y las respuestas del agente MUST poder apoyarse en el contenido de esos documentos.
- **FR-025**: El sistema MUST permitir marcar exactamente un agente como "por defecto", el cual MUST responder automáticamente los mensajes entrantes de toda conversación sin agente asignado y sin intervención humana activa.
- **FR-026**: Los usuarios MUST poder asignar cualquier agente a cualquier conversación específica, en cuyo caso ese agente MUST generar las respuestas automáticas de esa conversación.
- **FR-027**: El sistema MUST pausar la respuesta automática de una conversación cuando un asesor humano responde manualmente, y MUST permitir reactivarla o desactivarla por conversación en cualquier momento.
- **FR-028**: Los usuarios MUST poder editar y eliminar agentes; al eliminar un agente asignado, sus conversaciones MUST pasar al agente por defecto, y el agente por defecto no MUST poder eliminarse sin designar antes un reemplazo.
- **FR-029**: Si la generación de una respuesta automática falla (clave inválida, modelo no disponible, error del proveedor), el sistema MUST abstenerse de enviar mensajes de error al contacto, marcar la conversación para atención humana y notificar el error en el panel.

**Usuarios y acceso**

- **FR-030**: El sistema MUST requerir autenticación con credenciales individuales para acceder al panel.
- **FR-031**: El sistema MUST soportar al menos dos roles: administrador (gestiona bandejas, usuarios, etapas, API key y agentes) y asesor (atiende conversaciones, etiqueta, anota y usa el Kanban).
- **FR-032**: Los administradores MUST poder crear, editar y desactivar usuarios; la desactivación MUST invalidar las sesiones activas del usuario.
- **FR-033**: El sistema MUST operar como single-tenant: una sola organización/negocio por instancia desplegada.

**Configuración, despliegue y experiencia**

- **FR-034**: El sistema MUST ofrecer un panel de configuración que centralice: bandejas conectadas, usuarios, etiquetas, etapas del embudo, agentes de IA y la API key de OpenRouter.
- **FR-035**: La interfaz MUST ofrecer un diseño sobrio, claro y profesional, con modo oscuro conmutable por usuario y preferencia persistente entre sesiones.
- **FR-036**: El sistema MUST poder desplegarse de forma autocontenida en un VPS propio administrado con Coolify, sin dependencia de servicios de infraestructura de terceros para su operación básica (las integraciones de canal y de IA son externas por naturaleza).

**Verificabilidad y calidad**

- **FR-044**: El sistema MUST permitir, en modo de desarrollo/pruebas, la inyección de eventos simulados de WhatsApp (mensajes entrantes, estados de entrega, actualizaciones de estado de plantilla) idénticos en estructura a los reales, para verificar el producto de extremo a extremo sin depender de la integración real.
- **FR-045**: El producto MUST contar con verificación funcional de extremo a extremo (flujos de bandeja, respuesta, ventana de 24 h, plantillas, Kanban, agentes de IA) ejecutada contra la interfaz real antes de considerarse entregable.

### Key Entities

- **Bandeja (canal conectado)**: Un número de WhatsApp conectado al panel; incluye identificadores del número, credenciales de acceso al canal y estado de conexión (pendiente, conectada, fallida, desconectada).
- **Contacto / Lead**: Persona que escribe al negocio; incluye nombre, número/identificador del canal, etiquetas asignadas y etapa actual del embudo. Se crea automáticamente con la primera conversación.
- **Conversación**: Hilo de mensajes entre un contacto y el negocio por una bandeja; incluye estado de lectura, agente de IA asignado (opcional), estado de la respuesta automática (activa/pausada) y asesor que interviene.
- **Mensaje**: Unidad de comunicación dentro de una conversación; entrante o saliente, con contenido (texto o adjunto), autor (contacto, asesor o agente de IA), fecha y estado de entrega.
- **Etiqueta**: Marcador con nombre y color asignable a leads; reutilizable en todo el panel.
- **Nota**: Comentario interno asociado a una conversación, con autor y fecha; nunca visible para el contacto.
- **Etapa del embudo**: Una de las 4 fases del proceso comercial; con nombre editable y orden fijo; cada lead pertenece a exactamente una etapa.
- **Usuario del panel**: Cuenta de acceso de un miembro del negocio; con rol (administrador o asesor), estado (activo/inactivo) y preferencias (modo oscuro).
- **Agente de IA**: Configuración de un asistente automático; incluye nombre, propósito, tono, instrucciones, modelo de lenguaje seleccionado (OpenRouter), documentos de conocimiento asociados y marca de "por defecto".
- **Documento de conocimiento**: Archivo cargado por el usuario como fuente de contexto para un agente de IA.
- **Credencial de IA**: API key de OpenRouter del negocio, almacenada de forma segura y nunca expuesta en texto plano.
- **Plantilla de mensaje**: Mensaje preaprobado por Meta asociado a una bandeja; incluye nombre, categoría, idioma, cuerpo con variables, estado de aprobación (pendiente, aprobada, rechazada con motivo, deshabilitada) y fecha de última actualización de estado.
- **Ventana de servicio**: Estado derivado por conversación (abierta/cerrada y tiempo restante) calculado desde el último mensaje entrante del contacto; determina si se permite texto libre o solo plantillas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un mensaje enviado por un cliente al número conectado es visible en el panel en menos de 3 segundos, sin que el usuario recargue la página.
- **SC-002**: Una respuesta enviada desde el panel llega al contacto en menos de 5 segundos en condiciones normales del canal.
- **SC-003**: Un administrador sin conocimientos técnicos completa la conexión de un número de WhatsApp (incluido el onboarding externo) en menos de 5 minutos, y la bandeja queda recibiendo mensajes.
- **SC-004**: El 100% de los mensajes entrantes de las bandejas conectadas queda registrado en el panel (cero pérdida de mensajes), incluso ante desconexiones temporales de los navegadores de los usuarios.
- **SC-005**: El agente de IA por defecto responde automáticamente un mensaje entrante en menos de 15 segundos en condiciones normales del proveedor de IA.
- **SC-006**: Un usuario sin conocimientos técnicos crea un agente de IA funcional mediante el wizard (incluyendo carga de un documento) en menos de 10 minutos.
- **SC-007**: El panel opera con fluidez con al menos 10 usuarios concurrentes y 5,000 conversaciones acumuladas sin degradación perceptible.
- **SC-008**: Mover un lead de etapa en el Kanban toma una sola acción y el cambio es visible para los demás usuarios en menos de 3 segundos.
- **SC-009**: El 95% de las respuestas automáticas sobre temas cubiertos por los documentos cargados refleja correctamente la información de esos documentos (validación por muestreo).
- **SC-010**: Una instancia nueva del panel queda desplegada y operativa en un VPS con Coolify en menos de 30 minutos siguiendo la guía de despliegue.
- **SC-011**: El 100% de los intentos de envío de texto libre fuera de la ventana de 24 horas es bloqueado por el panel antes de llegar al canal, con la alternativa de plantilla ofrecida en el mismo flujo.
- **SC-012**: Un administrador crea una plantilla con variables y vista previa en menos de 3 minutos sin consultar documentación externa.
- **SC-013**: Todos los flujos críticos (recepción en tiempo real, respuesta, ventana de 24 h, envío de plantilla, movimiento en Kanban, respuesta automática de IA) cuentan con verificación de extremo a extremo aprobada usando eventos simulados de WhatsApp.

## Assumptions

- **Single-tenant**: cada despliegue sirve a un solo negocio; no hay separación de organizaciones dentro de una misma instancia.
- **Alcance de canales**: solo WhatsApp en esta fase; Instagram, Facebook, LinkedIn y correo quedan explícitamente fuera (fase siguiente), pero el diseño conceptual de "bandeja" admite múltiples canales a futuro.
- **Múltiples bandejas**: el negocio puede conectar más de un número de WhatsApp; cada conversación pertenece a una bandeja.
- **Etapas del embudo**: la cantidad es fija (4) según lo solicitado; los nombres son editables por el administrador. Nombres por defecto: "Nuevo", "En conversación", "Calificado", "Cerrado".
- **Roles**: dos roles (administrador y asesor) son suficientes para esta fase; todos los usuarios ven todas las conversaciones (sin asignación exclusiva por asesor).
- **Comportamiento de la IA**: la respuesta automática se pausa por conversación cuando interviene un humano, y puede reactivarse manualmente; este es el comportamiento por defecto asumido.
- **Costos de IA**: el consumo de OpenRouter corre por cuenta del negocio mediante su propia API key; el panel no intermedia facturación.
- **Mensajes salientes**: en esta fase se garantiza el envío de texto; el envío de adjuntos salientes es deseable pero no bloqueante para el MVP. La recepción de adjuntos sí es obligatoria (FR-005).
- **Ventana de 24 horas**: el panel aplica la regla de forma proactiva (bloqueo local antes de intentar el envío) además de reflejar cualquier rechazo del canal como mensaje fallido con motivo visible; ante ambigüedad de marca de tiempo, la ventana se trata como cerrada.
- **Plantillas**: la creación y consulta de estado de plantillas se realiza con las credenciales de la bandeja conectada; los tiempos de aprobación los controla Meta y el panel solo refleja el estado. En fase 1 se soportan plantillas con cuerpo de texto y variables de posición; encabezados multimedia y botones complejos son deseables, no bloqueantes.
- **Posicionamiento del producto**: alcance tipo "Chatwoot ligero" — calidad enterprise en los flujos incluidos, sin funciones fuera del alcance declarado (sin informes avanzados, sin SLA, sin omnicanal completo en esta fase).
- **Verificación**: el producto se considera terminado solo tras pasar verificación E2E con eventos simulados de WhatsApp estructuralmente idénticos a los reales (incluidos mensajes con más de 24 horas de antigüedad para probar la ventana).
- **Onboarding externo**: la web `aishiagency.tech` y el intercambio de tokens del tech provider son sistemas existentes del dueño del producto; el panel solo consume la entrega de identificadores/token y los eventos redirigidos.
- **Retención de datos**: las conversaciones, notas y documentos se retienen indefinidamente mientras la instancia exista; no se requiere política de purga en esta fase.
- **Idioma**: la interfaz se entrega en español como idioma principal.
