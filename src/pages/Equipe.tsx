import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, ROLE_LABELS, ROLE_OPTIONS, AppRole } from "@/hooks/useUserRoles";
import { useProfiles } from "@/hooks/useLeads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Profile } from "@/types/crm";

export const TeamManagement = () => {
  const { user } = useAuth();
  const perms = usePermissions();
  const profiles = useProfiles(perms.canManageTeam);
  const qc = useQueryClient();

  const allRoles = useQuery({
    queryKey: ["user_roles_all"],
    enabled: perms.canManageTeam,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role, id");
      if (error) throw error;
      return data;
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (p: { id: string; full_name?: string; is_active?: boolean; can_receive_leads?: boolean }) => {
      const { id, ...patch } = p;
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("set_user_role", {
        _target_user_id: userId,
        _role: role,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_roles_all"] });
      qc.invalidateQueries({ queryKey: ["my_roles"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Função atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (perms.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!perms.canManageTeam) return <Navigate to="/configuracoes" replace />;

  const rolesByUser = new Map<string, AppRole>();
  (allRoles.data ?? []).forEach((r) => {
    const order: Record<AppRole, number> = {
      admin: 1,
      gestor: 2,
      consultor: 3,
      visualizador: 4,
      user: 5,
    };
    const currentRole = rolesByUser.get(r.user_id);
    if (!currentRole || (order[r.role] ?? 99) < (order[currentRole] ?? 99)) {
      rolesByUser.set(r.user_id, r.role);
    }
  });

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          Gerenciamento de usuários
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gerencie usuários, funções e atribuição de leads
        </p>
      </div>

      {profiles.isLoading || allRoles.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Função</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Ativo</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Recebe leads
                  </th>
                </tr>
              </thead>
              <tbody>
                {(profiles.data ?? []).map((profile) => (
                  <UserRow
                    key={profile.id}
                    profile={profile}
                    role={rolesByUser.get(profile.id) ?? "user"}
                    isMe={profile.id === user?.id}
                    isUpdatingRole={setRole.isPending}
                    onSaveName={(full_name) => updateProfile.mutate({ id: profile.id, full_name })}
                    onToggleActive={(value) => updateProfile.mutate({ id: profile.id, is_active: value })}
                    onToggleReceive={(value) =>
                      updateProfile.mutate({ id: profile.id, can_receive_leads: value })
                    }
                    onChangeRole={(role) => setRole.mutate({ userId: profile.id, role })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_OPTIONS.map((role) => (
          <Card key={role.value} className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {role.label}
            </p>
            <p className="mt-1 text-sm text-foreground">{role.description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
};

const UserRow = ({
  profile,
  role,
  isMe,
  isUpdatingRole,
  onSaveName,
  onToggleActive,
  onToggleReceive,
  onChangeRole,
}: {
  profile: Profile;
  role: AppRole;
  isMe: boolean;
  isUpdatingRole: boolean;
  onSaveName: (name: string) => void;
  onToggleActive: (value: boolean) => void;
  onToggleReceive: (value: boolean) => void;
  onChangeRole: (role: AppRole) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.full_name ?? "");
  const isActive = profile.is_active !== false;
  const canReceive = profile.can_receive_leads !== false;

  return (
    <tr className="border-b hover:bg-muted/20 last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 w-44"
                maxLength={120}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  onSaveName(name.trim());
                  setEditing(false);
                }}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setName(profile.full_name ?? "");
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-medium text-foreground">
                  {profile.full_name || profile.email || "Sem nome"}
                </p>
                {isMe && (
                  <Badge variant="secondary" className="text-[10px]">
                    você
                  </Badge>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <Select
          value={role}
          onValueChange={(value) => {
            const nextRole = value as AppRole;
            if (nextRole !== role) onChangeRole(nextRole);
          }}
          disabled={isUpdatingRole}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue>{ROLE_LABELS[role]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div>
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-3 text-center">
        <Switch checked={isActive} onCheckedChange={onToggleActive} />
      </td>
      <td className="px-4 py-3 text-center">
        <Switch checked={canReceive} onCheckedChange={onToggleReceive} disabled={!isActive} />
      </td>
    </tr>
  );
};

export default TeamManagement;
