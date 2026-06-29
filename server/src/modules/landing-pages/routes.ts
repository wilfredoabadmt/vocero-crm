import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { landingPages } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { landingPageService } from './service.js';

export function landingPageRoutes(app: FastifyInstance) {
  // Listar landing pages del usuario
  app.get('/api/landing-pages', { preHandler: requireAuth }, async (request) => {
    const pages = await landingPageService.getPages(request.currentUser!.id);
    return { items: pages };
  });

  // Crear landing page
  app.post('/api/landing-pages', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        content: z.record(z.unknown()).optional(),
        form_fields: z
          .array(
            z.object({
              name: z.string(),
              label: z.string(),
              type: z.enum(['text', 'email', 'phone', 'textarea', 'select']),
              required: z.boolean().default(true),
            })
          )
          .optional(),
        inbox_id: z.number().int().positive().optional(),
        stage_id: z.number().int().positive().optional(),
        thank_you_message: z.string().optional(),
        meta_title: z.string().optional(),
        meta_description: z.string().optional(),
      })
      .parse(request.body);

    const page = await landingPageService.createPage({
      ...body,
      slug: body.slug,
      content: body.content,
      formFields: body.form_fields,
      inboxId: body.inbox_id,
      stageId: body.stage_id,
      thankYouMessage: body.thank_you_message,
      metaTitle: body.meta_title,
      metaDescription: body.meta_description,
      createdBy: request.currentUser!.id,
    });

    reply.code(201);
    return page;
  });

  // Obtener landing page por ID
  app.get('/api/landing-pages/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const page = await landingPageService.getPageById(id);
    if (!page) throw notFound('Landing page no encontrada');
    return page;
  });

  // Actualizar landing page
  app.patch('/api/landing-pages/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = z
      .object({
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        content: z.record(z.unknown()).optional(),
        form_fields: z
          .array(
            z.object({
              name: z.string(),
              label: z.string(),
              type: z.enum(['text', 'email', 'phone', 'textarea', 'select']),
              required: z.boolean(),
            })
          )
          .optional(),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        inbox_id: z.number().int().positive().nullable().optional(),
        stage_id: z.number().int().positive().nullable().optional(),
        thank_you_message: z.string().optional(),
        meta_title: z.string().optional(),
        meta_description: z.string().optional(),
        custom_css: z.string().optional(),
        custom_js: z.string().optional(),
      })
      .parse(request.body);

    const result = await landingPageService.updatePage(id, {
      slug: body.slug,
      title: body.title,
      description: body.description,
      content: body.content,
      formFields: body.form_fields,
      status: body.status,
      inboxId: body.inbox_id,
      stageId: body.stage_id,
      thankYouMessage: body.thank_you_message,
      metaTitle: body.meta_title,
      metaDescription: body.meta_description,
      customCss: body.custom_css,
      customJs: body.custom_js,
    });

    if (!result) throw notFound('Landing page no encontrada');
    return result;
  });

  // Eliminar landing page
  app.delete('/api/landing-pages/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [existing] = await db.select().from(landingPages).where(eq(landingPages.id, id));
    if (!existing) throw notFound('Landing page no encontrada');
    return landingPageService.deletePage(id);
  });

  // Obtener envíos de una landing page
  app.get('/api/landing-pages/:id/submissions', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const submissions = await landingPageService.getPageSubmissions(id);
    return { items: submissions };
  });

  // Actualizar estado de envío
  app.patch('/api/form-submissions/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(['new', 'contacted', 'converted', 'archived']),
        notes: z.string().optional(),
      })
      .parse(request.body);

    const result = await landingPageService.updateSubmissionStatus(id, body.status, body.notes);
    if (!result) throw notFound('Envío no encontrado');
    return result;
  });

  // ========== RUTAS PÚBLICAS (sin auth) ==========

  // Obtener landing page publicada por slug
  app.get('/api/lp/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const page = await landingPageService.getPageBySlug(slug);
    if (!page) {
      reply.code(404);
      return { error: 'Página no encontrada' };
    }
    return page;
  });

  // Enviar formulario
  app.post('/api/lp/:slug/submit', async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const body = z.object({ data: z.record(z.unknown()) }).parse(request.body);

    const page = await landingPageService.getPageBySlug(slug);
    if (!page) {
      reply.code(404);
      return { error: 'Página no encontrada' };
    }

    const result = await landingPageService.submitForm(
      page.id,
      body.data,
      {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        referrer: request.headers.referer,
      }
    );

    if (!result) {
      reply.code(400);
      return { error: 'Error al enviar formulario' };
    }

    return result;
  });
}
