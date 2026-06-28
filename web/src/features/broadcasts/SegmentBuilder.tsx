import { TagChip } from '@/components/ui/badge';
import { Input, Label, FieldHint } from '@/components/ui/input';
import type { Stage, Tag } from '@/lib/types';

interface SegmentBuilderProps {
  stages: Stage[];
  tags: Tag[];
  filters: {
    stage_id?: number;
    tag_ids?: number[];
    min_score?: number;
    max_score?: number;
    last_activity_days?: number;
  };
  onChange: (filters: SegmentBuilderProps['filters']) => void;
}

export function SegmentBuilder({ stages, tags, filters, onChange }: SegmentBuilderProps) {
  const toggleTag = (tagId: number) => {
    const current = filters.tag_ids ?? [];
    const newTagIds = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
    onChange({ ...filters, tag_ids: newTagIds.length > 0 ? newTagIds : undefined });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          Los filtros se combinan con AND. Si no seleccionas ningún filtro, se enviará a todos los contactos de la bandeja.
        </p>
      </div>

      <div>
        <Label>Etapa del embudo</Label>
        <select
          value={filters.stage_id?.toString() ?? ''}
          onChange={(e) => onChange({ ...filters, stage_id: e.target.value ? Number(e.target.value) : undefined })}
          data-testid="segment-stage"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Todas las etapas</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
        <FieldHint>Filtrar contactos en una etapa específica</FieldHint>
      </div>

      <div>
        <Label>Etiquetas</Label>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="segment-tags">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filters.tag_ids?.includes(tag.id)
                  ? 'bg-accent text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <TagChip name={tag.name} color={tag.color} />
            </button>
          ))}
          {tags.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay etiquetas creadas</p>
          )}
        </div>
        <FieldHint>Selecciona una o más etiquetas para filtrar</FieldHint>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Score mínimo</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={filters.min_score ?? ''}
            onChange={(e) => onChange({ ...filters, min_score: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="1"
            data-testid="segment-min-score"
          />
          <FieldHint>Lead scoring mínimo (1-100)</FieldHint>
        </div>
        <div>
          <Label>Score máximo</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={filters.max_score ?? ''}
            onChange={(e) => onChange({ ...filters, max_score: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="100"
            data-testid="segment-max-score"
          />
          <FieldHint>Lead scoring máximo (1-100)</FieldHint>
        </div>
      </div>

      <div>
        <Label>Últimos días con actividad</Label>
        <Input
          type="number"
          min={1}
          value={filters.last_activity_days ?? ''}
          onChange={(e) => onChange({ ...filters, last_activity_days: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Ej: 30"
          data-testid="segment-activity-days"
        />
        <FieldHint>Contactos con actividad en los últimos X días</FieldHint>
      </div>
    </div>
  );
}
