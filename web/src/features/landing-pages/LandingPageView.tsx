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
    queryFn: () => fetch(`/api/lp/${params.slug}`).then((r) => {
      if (!r.ok) throw new Error('Página no encontrada');
      return r.json();
    }),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/lp/${params.slug}/submit`, {
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
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[#070b19] text-slate-100 overflow-hidden p-4">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-blue-500/10 blur-[80px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md text-center rounded-2xl border border-white/5 bg-[#0e1630]/60 backdrop-blur-lg p-8 shadow-2xl shadow-black/40">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-lime-500/10 border border-lime-500/20 text-lime-400 text-2xl">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-white">{page.title}</h1>
          <p className="mt-4 text-slate-300">{page.thank_you_message ?? '¡Gracias por contactarnos!'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-[#070b19] text-slate-100 overflow-hidden py-16 px-4">
      {/* Resplandores de fondo futuristas */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-blue-500/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="rounded-2xl border border-white/5 bg-[#0e1630]/60 backdrop-blur-lg p-8 md:p-10 shadow-2xl shadow-black/40">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{page.title}</h1>
          {page.description && (
            <p className="mt-3 text-slate-300 text-sm leading-relaxed">{page.description}</p>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {page.form_fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name} className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {field.label} {field.required && <span className="text-lime-500">*</span>}
                </Label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={field.name}
                    required={field.required}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#070b19]/60 text-white placeholder-slate-500 focus:border-lime-500/50 focus:ring-lime-500/20 px-4 py-3 text-sm focus:outline-none transition-all duration-300 min-h-[100px]"
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
                    className="border-white/10 bg-[#070b19]/60 text-white placeholder-slate-500 focus:border-lime-500/50 focus:ring-lime-500/20 rounded-xl px-4 py-2.5"
                  />
                )}
              </div>
            ))}

            <Button 
              type="submit" 
              className="w-full mt-6 bg-[#84cc16] hover:bg-[#a3e635] text-[#070b19] font-bold py-2.5 rounded-xl transition-all duration-300 shadow-lg shadow-lime-500/10 hover:shadow-[0_0_20px_rgba(132,204,22,0.4)] border-0"
            >
              Enviar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
