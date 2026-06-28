import { useState } from 'react';
import { Download, FileText, Table, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const [type, setType] = useState<string>('contacts');
  const [format, setFormat] = useState<string>('csv');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ type, format }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Error al exportar');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `export_${type}.${format}`;

      // Descargar archivo
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `export_${type}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Exportación completada');
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Exportar Datos" className="max-w-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Exportar Datos</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <Label>Tipo de datos *</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} data-testid="export-type" className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="contacts">Contactos</option>
              <option value="conversations">Conversaciones</option>
              <option value="tasks">Tareas</option>
            </select>
          </div>

          <div>
            <Label>Formato *</Label>
            <div className="mt-2 flex gap-2">
              <Button
                variant={format === 'csv' ? 'accent' : 'outline'}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => setFormat('csv')}
              >
                <Table className="h-4 w-4" /> CSV
              </Button>
              <Button
                variant={format === 'json' ? 'accent' : 'outline'}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => setFormat('json')}
              >
                <FileText className="h-4 w-4" /> JSON
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {type === 'contacts' && 'Incluye nombre, teléfono, fuente, score, etapa y agente asignado.'}
            {type === 'conversations' && 'Incluye contactos, último mensaje, estado y fecha de creación.'}
            {type === 'tasks' && 'Incluye título, tipo, estado, prioridad y fechas.'}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              onClick={handleExport}
              disabled={loading}
              data-testid="export-submit"
            >
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Exportando...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" /> Exportar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
