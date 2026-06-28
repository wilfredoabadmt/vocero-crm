import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  landingPages,
  formSubmissions,
  contacts,
  inboxes,
  stages,
  users,
} from '../../db/schema.js';
import { broadcast } from '../../realtime/hub.js';

export class LandingPageService {
  // Crear landing page
  async createPage(data: {
    slug: string;
    title: string;
    description?: string;
    content?: Record<string, unknown>;
    formFields?: Array<{ name: string; label: string; type: string; required: boolean }>;
    inboxId?: number;
    stageId?: number;
    thankYouMessage?: string;
    metaTitle?: string;
    metaDescription?: string;
    customCss?: string;
    customJs?: string;
    createdBy: number;
  }) {
    const [page] = await db
      .insert(landingPages)
      .values({
        slug: data.slug,
        title: data.title,
        description: data.description,
        content: data.content ?? {},
        formFields: data.formFields ?? [],
        inboxId: data.inboxId,
        stageId: data.stageId,
        thankYouMessage: data.thankYouMessage,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        customCss: data.customCss,
        customJs: data.customJs,
        createdBy: data.createdBy,
      })
      .returning();

    return this.serializePage(page!);
  }

  // Serializar landing page
  private serializePage(page: typeof landingPages.$inferSelect) {
    return {
      ...page,
      form_fields: Array.isArray(page.formFields) ? page.formFields : [],
      content: page.content ?? {},
      thank_you_message: page.thankYouMessage,
      meta_title: page.metaTitle,
      meta_description: page.metaDescription,
      custom_css: page.customCss,
      custom_js: page.customJs,
      view_count: page.viewCount,
      submission_count: page.submissionCount,
      created_by: page.createdBy,
      published_at: page.publishedAt?.toISOString() ?? null,
      created_at: page.createdAt.toISOString(),
      updated_at: page.updatedAt.toISOString(),
    };
  }

  // Actualizar landing page
  async updatePage(pageId: number, data: Partial<{
    slug: string;
    title: string;
    description: string;
    content: Record<string, unknown>;
    formFields: Array<{ name: string; label: string; type: string; required: boolean }>;
    status: string;
    inboxId: number | null;
    stageId: number | null;
    thankYouMessage: string;
    metaTitle: string;
    metaDescription: string;
    customCss: string;
    customJs: string;
  }>) {
    const updates: Record<string, unknown> = {};
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.content !== undefined) updates.content = data.content;
    if (data.formFields !== undefined) updates.formFields = data.formFields;
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === 'published') updates.publishedAt = new Date();
    }
    if (data.inboxId !== undefined) updates.inboxId = data.inboxId;
    if (data.stageId !== undefined) updates.stageId = data.stageId;
    if (data.thankYouMessage !== undefined) updates.thankYouMessage = data.thankYouMessage;
    if (data.metaTitle !== undefined) updates.metaTitle = data.metaTitle;
    if (data.metaDescription !== undefined) updates.metaDescription = data.metaDescription;
    if (data.customCss !== undefined) updates.customCss = data.customCss;
    if (data.customJs !== undefined) updates.customJs = data.customJs;

    const [updated] = await db
      .update(landingPages)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(landingPages.id, pageId))
      .returning();

    if (updated) {
      broadcast('landing:updated', { page_id: updated.id });
    }

    return updated ? this.serializePage(updated) : null;
  }

  // Eliminar landing page
  async deletePage(pageId: number) {
    await db.delete(landingPages).where(eq(landingPages.id, pageId));
    broadcast('landing:deleted', { page_id: pageId });
    return { ok: true };
  }

  // Obtener landing pages
  async getPages(userId: number) {
    const pages = await db
      .select()
      .from(landingPages)
      .where(eq(landingPages.createdBy, userId))
      .orderBy(landingPages.createdAt);
    return pages.map(this.serializePage);
  }

  // Obtener landing page por slug (público)
  async getPageBySlug(slug: string) {
    const [page] = await db
      .select()
      .from(landingPages)
      .where(and(eq(landingPages.slug, slug), eq(landingPages.status, 'published')));

    if (page) {
      // Incrementar contador de vistas
      await db
        .update(landingPages)
        .set({ viewCount: sql`${landingPages.viewCount} + 1` })
        .where(eq(landingPages.id, page.id));
    }

    return page ? this.serializePage(page) : null;
  }

  // Obtener landing page por ID
  async getPageById(pageId: number) {
    const [page] = await db.select().from(landingPages).where(eq(landingPages.id, pageId));
    return page ? this.serializePage(page) : null;
  }

  // Enviar formulario
  async submitForm(
    pageId: number,
    data: Record<string, unknown>,
    meta?: { ipAddress?: string; userAgent?: string; referrer?: string }
  ) {
    // Verificar que la página existe y está publicada
    const [page] = await db
      .select()
      .from(landingPages)
      .where(and(eq(landingPages.id, pageId), eq(landingPages.status, 'published')));

    if (!page) return null;

    // Crear contacto si hay datos suficientes
    let contactId: number | null = null;
    if (page.inboxId && (data.email || data.phone || data.wa_id)) {
      const [contact] = await db
        .insert(contacts)
        .values({
          inboxId: page.inboxId,
          waId: (data.wa_id as string) ?? (data.phone as string) ?? (data.email as string) ?? '',
          name: (data.name as string) ?? (data.first_name as string) ?? null,
          phone: (data.phone as string) ?? null,
          stageId: page.stageId ?? 1,
          source: 'landing_page',
          sourceMetadata: { landing_page_id: pageId, slug: page.slug },
        })
        .returning();

      contactId = contact?.id ?? null;
    }

    // Crear envío del formulario
    const [submission] = await db
      .insert(formSubmissions)
      .values({
        landingPageId: pageId,
        contactId,
        data,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        referrer: meta?.referrer,
      })
      .returning();

    // Incrementar contador de envíos
    await db
      .update(landingPages)
      .set({ submissionCount: sql`${landingPages.submissionCount} + 1` })
      .where(eq(landingPages.id, pageId));

    broadcast('landing:submission', {
      page_id: pageId,
      submission_id: submission!.id,
      contact_id: contactId,
    });

    return {
      submission: submission!,
      thankYouMessage: page.thankYouMessage,
    };
  }

  // Obtener envíos de una landing page
  async getPageSubmissions(pageId: number) {
    return db
      .select({
        id: formSubmissions.id,
        data: formSubmissions.data,
        status: formSubmissions.status,
        notes: formSubmissions.notes,
        createdAt: formSubmissions.createdAt,
        contactId: formSubmissions.contactId,
        contactName: contacts.name,
        contactWaId: contacts.waId,
      })
      .from(formSubmissions)
      .leftJoin(contacts, eq(formSubmissions.contactId, contacts.id))
      .where(eq(formSubmissions.landingPageId, pageId))
      .orderBy(formSubmissions.createdAt);
  }

  // Actualizar estado de envío
  async updateSubmissionStatus(submissionId: number, status: string, notes?: string) {
    const updates: Record<string, unknown> = { status };
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db
      .update(formSubmissions)
      .set(updates)
      .where(eq(formSubmissions.id, submissionId))
      .returning();

    return updated ?? null;
  }
}

export const landingPageService = new LandingPageService();
