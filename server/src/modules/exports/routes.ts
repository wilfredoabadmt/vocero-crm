import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../auth/guards.js';
import { exportService } from './service.js';

export function exportRoutes(app: FastifyInstance) {
  // Exportar datos
  app.post('/api/export', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        format: z.enum(['csv', 'json']).default('csv'),
        type: z.enum(['contacts', 'conversations', 'tasks']),
        filters: z
          .object({
            stage_id: z.number().int().positive().optional(),
            assigned_to: z.number().int().positive().optional(),
            tag_ids: z.array(z.number().int().positive()).optional(),
            date_from: z.string().optional(),
            date_to: z.string().optional(),
          })
          .optional(),
      })
      .parse(request.body);

    const result = await exportService.exportData(
      {
        format: body.format,
        type: body.type,
        filters: body.filters
          ? {
              stageId: body.filters.stage_id,
              assignedTo: body.filters.assigned_to,
              tagIds: body.filters.tag_ids,
              dateFrom: body.filters.date_from,
              dateTo: body.filters.date_to,
            }
          : undefined,
      },
      request.currentUser!.id
    );

    if (body.format === 'csv') {
      const csv = exportService.toCSV(result.data, result.columns);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${result.filename}.csv"`);
      // BOM para Excel
      return '\ufeff' + csv;
    }

    const json = exportService.toJSON(result.data);
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${result.filename}.json"`);
    return json;
  });
}
