import { useQuery } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useState } from 'react';
import { toast } from 'sonner';

interface LandingPageData {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  form_fields: Array<{ name: string; label: string; type: string; required: boolean }>;
  thank_you_message: string | null;
}

export function LandingPageView() {
  const params = useParams<{ slug: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const { data: page, isLoading, error } = useQuery<LandingPageData>({
    queryKey: ['lp', params.slug],
    queryFn: () => fetch(`/lp/${params.slug}`).then((r) => {
      if (!r.ok) throw new Error('Página no encontrada');
      return r.json();
    }),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/lp/${params.slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formData }),
      });
      if (!res.ok) throw new Error('Error al enviar');
      setSubmitted(true);
    } catch {
      toast.error('Error al enviar el formulario');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Página no encontrada</h1>
          <p className="mt-2 text-muted-foreground">Esta landing page no existe o no está publicada.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center rounded-xl border bg-card p-8 shadow-sm">
          <div className="mb-4 text-4xl">✅</div>
          <h1 className="text-xl font-bold">{page.title}</h1>
          <p className="mt-4 text-muted-foreground">{page.thank_you_message ?? '¡Gracias por contactarnos!'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>
          {page.description && (
            <p className="mt-2 text-muted-foreground">{page.description}</p>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {page.form_fields.map((field) => (
              <div key={field.name}>
                <Label htmlFor={field.name}>{field.label} {field.required && '*'}</Label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={field.name}
                    required={field.required}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={formData[field.name] ?? ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  />
                ) : (
                  <Input
                    id={field.name}
                    type={field.type === 'phone' ? 'tel' : field.type}
                    required={field.required}
                    value={formData[field.name] ?? ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  />
                )}
              </div>
            ))}

            <Button type="submit" className="w-full">
              Enviar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
