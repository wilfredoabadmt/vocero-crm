import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCog } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { Avatar, Spinner } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import type { PanelUser, User } from '@/lib/types';

export function UsersSettings() {
  const queryClient = useQueryClient();
  const me = queryClient.getQueryData<{ user: User }>(['me'])?.user;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PanelUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' as 'admin' | 'agent' });

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ items: PanelUser[] }>('/api/users') });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', password: '', role: 'agent' });
    setDialogOpen(true);
  };

  const openEdit = (u: PanelUser) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role });
    setDialogOpen(true);
  };

  const saveUser = useMutation({
    mutationFn: () => {
      if (editing) {
        const body: Record<string, unknown> = { name: form.name, role: form.role };
        if (form.password) body.password = form.password;
        return api.patch(`/api/users/${editing.id}`, body);
      }
      return api.post('/api/users', form);
    },
    onSuccess: () => {
      toast.success(editing ? 'Usuario actualizado' : 'Usuario creado');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.patch(`/api/users/${id}`, { is_active: active }),
    onSuccess: (_data, vars) => {
      toast.success(vars.active ? 'Usuario reactivado' : 'Usuario desactivado (sus sesiones fueron cerradas)');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar'),
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Usuarios del panel</h2>
          <p className="text-xs text-muted-foreground">Tu equipo de asesores y administradores</p>
        </div>
        <Button variant="accent" size="sm" className="gap-1.5" onClick={openCreate} data-testid="new-user">
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      {users.isLoading && <Spinner />}

      <div className="overflow-hidden rounded-lg border bg-card">
        {users.data?.items.map((u, i) => (
          <div key={u.id} className={`flex items-center gap-3 p-3 ${i > 0 ? 'border-t' : ''}`} data-testid={`user-row-${u.email}`}>
            <Avatar name={u.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{u.name}</span>
                <Badge variant={u.role === 'admin' ? 'accent' : 'outline'}>
                  {u.role === 'admin' ? 'Administrador' : 'Asesor'}
                </Badge>
                {!u.is_active && <Badge variant="destructive">Desactivado</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{u.email}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)} aria-label={`Editar ${u.name}`}>
              <UserCog className="h-4 w-4" />
            </Button>
            {u.id !== me?.id && (
              <Switch
                checked={u.is_active}
                onCheckedChange={(active) => toggleActive.mutate({ id: u.id, active })}
                aria-label={`Activar/desactivar ${u.name}`}
                data-testid={`user-active-${u.email}`}
              />
            )}
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent title={editing ? `Editar a ${editing.name}` : 'Nuevo usuario'}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="u-name">Nombre</Label>
              <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name" />
            </div>
            {!editing && (
              <div>
                <Label htmlFor="u-email">Correo electrónico</Label>
                <Input
                  id="u-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  data-testid="user-email"
                />
              </div>
            )}
            <div>
              <Label htmlFor="u-pass">{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</Label>
              <Input
                id="u-pass"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                data-testid="user-password"
              />
              <FieldHint>Mínimo 8 caracteres{editing ? '; al cambiarla se cierran sus sesiones' : ''}.</FieldHint>
            </div>
            <div>
              <Label>Rol</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'agent', label: 'Asesor', hint: 'Atiende conversaciones, etiqueta y usa el embudo' },
                    { value: 'admin', label: 'Administrador', hint: 'Todo lo anterior + configuración del panel' },
                  ] as const
                ).map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setForm({ ...form, role: r.value })}
                    disabled={editing?.id === me?.id}
                    className={`rounded-md border p-2.5 text-left transition-colors disabled:opacity-50 ${
                      form.role === r.value ? 'border-accent bg-accent/8 ring-1 ring-accent' : 'hover:bg-muted'
                    }`}
                  >
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{r.hint}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="accent"
                disabled={!form.name || (!editing && (!form.email || form.password.length < 8))}
                loading={saveUser.isPending}
                onClick={() => saveUser.mutate()}
                data-testid="user-save"
              >
                {editing ? 'Guardar' : 'Crear usuario'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
