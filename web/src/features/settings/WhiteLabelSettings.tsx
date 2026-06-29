import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Save, RotateCcw, Upload, Image as ImageIcon, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldHint } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

interface WhiteLabelData {
  name: string;
  logo: string;
  accent_color: string;
}

export function WhiteLabelSettings() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [accentColor, setAccentColor] = useState('#84cc16');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Consultar configuración actual
  const brandQuery = useQuery({
    queryKey: ['white-label'],
    queryFn: () => api.get<WhiteLabelData>('/api/settings/white-label'),
  });

  // Cargar valores iniciales del backend en el estado local
  useEffect(() => {
    if (brandQuery.data) {
      setName(brandQuery.data.name);
      setAccentColor(brandQuery.data.accent_color);
      setLogoPreview(brandQuery.data.logo);
    }
  }, [brandQuery.data]);

  // Mutación para guardar textos y color
  const saveTexts = useMutation({
    mutationFn: (data: Partial<WhiteLabelData>) => api.put<WhiteLabelData>('/api/settings/white-label', data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['white-label'] });
      // Evento global para refrescar el Sidebar y favicon al instante
      window.dispatchEvent(new CustomEvent('brand-settings-changed', { detail: data }));
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'No se pudieron guardar los ajustes');
    },
  });

  // Guardado principal
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('El nombre comercial no puede estar vacío');
      return;
    }

    try {
      // 1. Si hay archivo de logo seleccionado, subirlo primero
      let uploadedLogoUrl = undefined;
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        
        const logoRes = await api.post<{ logo: string }>('/api/settings/white-label/logo', formData);
        uploadedLogoUrl = logoRes.logo;
        setLogoFile(null);
      }

      // 2. Guardar el resto de los textos y colores
      await saveTexts.mutateAsync({
        name: name.trim(),
        accent_color: accentColor,
        ...(uploadedLogoUrl && { logo: uploadedLogoUrl }),
      });

      toast.success('Configuración de Marca Blanca guardada con éxito');
    } catch (err) {
      toast.error('Error al aplicar los cambios de Marca Blanca');
    }
  };

  // Restaurar valores por defecto de CRM TOI
  const handleReset = useMutation({
    mutationFn: () => api.put<WhiteLabelData>('/api/settings/white-label', {
      name: 'CRM TOI',
      logo: '/logo.png',
      accent_color: '#84cc16',
    }),
    onSuccess: (data) => {
      setName('CRM TOI');
      setAccentColor('#84cc16');
      setLogoPreview('/logo.png');
      setLogoFile(null);
      queryClient.invalidateQueries({ queryKey: ['white-label'] });
      window.dispatchEvent(new CustomEvent('brand-settings-changed', { detail: data }));
      toast.success('Valores de fábrica restablecidos');
    },
    onError: () => {
      toast.error('No se pudo restablecer la configuración');
    },
  });

  // Manejo de la imagen cargada
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      toast.error('Formato inválido. Formatos permitidos: PNG, JPG, WEBP');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen supera los 2 MB de tamaño límite');
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  if (brandQuery.isLoading) {
    return <div className="text-center py-10 text-xs text-muted-foreground">Cargando perfil de marca...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          Marca Blanca y Personalización (White Label)
        </h2>
        <p className="text-xs text-muted-foreground">
          Adapta la apariencia visual del CRM a la identidad de tu empresa o marca comercial.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        
        {/* Formulario a la Izquierda */}
        <form onSubmit={handleSave} className="lg:col-span-3 rounded-lg border bg-card p-6 space-y-6">
          <div className="space-y-4">
            
            {/* Nombre del Sistema */}
            <div className="space-y-2">
              <Label htmlFor="brand-name">Nombre comercial de tu CRM</Label>
              <Input
                id="brand-name"
                type="text"
                placeholder="Ej. MiCRM"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <FieldHint>Reemplazará el nombre "CRM TOI" en el menú, barra de navegación y pestaña del explorador.</FieldHint>
            </div>

            {/* Color de Acento */}
            <div className="space-y-2">
              <Label htmlFor="accent-color">Color principal de acento</Label>
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border">
                  <input
                    type="color"
                    id="accent-color-picker"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer border-0 p-0 opacity-100 bg-transparent"
                    style={{ WebkitAppearance: 'none' }}
                  />
                </div>
                <Input
                  id="accent-color"
                  type="text"
                  placeholder="#84cc16"
                  value={accentColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAccentColor(val);
                  }}
                  className="w-32 font-mono"
                  maxLength={7}
                />
              </div>
              <FieldHint>Define el color de los botones principales, enlaces y bordes resaltados.</FieldHint>
            </div>

            {/* Subir Logotipo */}
            <div className="space-y-2">
              <Label>Logotipo del sistema</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border bg-muted/40 overflow-hidden p-2">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logotipo actual" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
                
                <div className="flex-1">
                  <label 
                    htmlFor="logo-upload"
                    className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium cursor-pointer hover:bg-muted transition-colors gap-2"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Seleccionar imagen
                  </label>
                  <input
                    type="file"
                    id="logo-upload"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <FieldHint>Recomendado: Imagen cuadrada PNG transparente (máx. 2MB).</FieldHint>
                </div>
              </div>
            </div>

          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-between border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleReset.mutate()}
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={handleReset.isPending || saveTexts.isPending}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restablecer valores
            </Button>

            <Button
              type="submit"
              variant="accent"
              className="text-xs px-5"
              loading={saveTexts.isPending}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Guardar marca
            </Button>
          </div>
        </form>

        {/* Previsualización en tiempo real a la Derecha */}
        <div className="lg:col-span-2 flex flex-col space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Previsualización de marca</h3>
          
          <div className="flex-1 rounded-lg border bg-card p-6 flex flex-col justify-between min-h-[300px]">
            {/* Header / Sidebar Simulado */}
            <div className="space-y-4">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block pb-1 border-b">Maqueta de Interfaz</span>
              
              {/* Barra lateral simulada */}
              <div className="rounded-xl border bg-background p-3 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card p-1">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <div className="h-4 w-4 rounded-full bg-accent" />
                    )}
                  </div>
                  <span className="font-bold text-sm text-foreground">{name || 'CRM TOI'}</span>
                </div>
                <div className="h-2 w-8 rounded-full bg-muted" />
              </div>

              {/* Botón de prueba con color de acento inyectado directamente por inline styles */}
              <div className="rounded-xl border bg-background p-4 flex flex-col items-center justify-center gap-3 shadow-md">
                <p className="text-[10px] text-muted-foreground text-center">Botón de acento activo</p>
                <button
                  type="button"
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-lg flex items-center gap-1.5 transition-all"
                  style={{ 
                    backgroundColor: accentColor,
                    boxShadow: `0 4px 12px ${accentColor}25`
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Botón Activo
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border p-3 text-[10px] text-muted-foreground leading-relaxed text-center italic">
              El color de acento se propaga dinámicamente en todo el sistema utilizando inyección de variables CSS en caliente.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
