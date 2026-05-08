import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Check, ChevronDown, Crown, Loader2, Pencil, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  MANAGEABLE_STATUS_OPTIONS,
  ROLE_LABELS,
  ROLE_OPTIONS,
  STATUS_LABELS,
  OperationalRole,
  UserAccessStatus,
  usePermissions,
} from "@/hooks/useUserRoles";
import { useProfiles } from "@/hooks/useLeads";
import { useFunnels } from "@/hooks/useFunnels";
import { isOwnerEmail } from "@/lib/access";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Funnel, Profile } from "@/types/crm";

const statusTone: Record<UserAccessStatus, string> = {
  pending: "bg-warning/12 text-warning border-warning/25",
  active: "bg-success/12 text-success border-success/25",
  suspended: "bg-destructive/12 text-destructive border-destructive/25",
  inactive: "bg-muted text-muted-foreground border-border",
};

export const TeamManagement = () => {
  const { user } = useAuth();
  const perms = usePermissions();
  const profiles = useProfiles(perms.canManageTeam);
  const funnels = useFunnels(perms.canManageTeam);
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

  const allFunnelAccess = useQuery({
    queryKey: ["user_funnel_access_all"],
    enabled: perms.canManageTeam,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_funnel_access").select("user_id, funnel_id");
      if (error) throw error;
      return data;
    },
  });

  const invalidateUserState = () => {
    qc.invalidateQueries({ queryKey: ["funnels"] });
    qc.invalidateQueries({ queryKey: ["profiles"] });
    qc.invalidateQueries({ queryKey: ["user_roles_all"] });
    qc.invalidateQueries({ queryKey: ["user_funnel_access_all"] });
    qc.invalidateQueries({ queryKey: ["my_roles"] });
    qc.invalidateQueries({ queryKey: ["my_profile"] });
    qc.invalidateQueries({ queryKey: ["assignable_profiles"] });
  };

  const updateProfile = useMutation({
    mutationFn: async (payload: { id: string; full_name?: string; can_receive_leads?: boolean }) => {
      const { id, ...patch } = payload;
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateUserState();
      toast.success("Atualizacao salva");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: OperationalRole }) => {
      const { error } = await supabase.rpc("set_user_role", {
        _target_user_id: userId,
        _role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateUserState();
      toast.success("Funcao atualizada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: Exclude<UserAccessStatus, "pending"> }) => {
      const { error } = await supabase.rpc("set_user_status", {
        _target_user_id: userId,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateUserState();
      toast.success("Status atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setFunnelScope = useMutation({
    mutationFn: async ({
      userId,
      hasAllFunnelAccess,
      funnelIds,
    }: {
      userId: string;
      hasAllFunnelAccess: boolean;
      funnelIds: string[];
    }) => {
      const { error } = await supabase.rpc("set_user_funnel_scope", {
        _target_user_id: userId,
        _has_all_funnel_access: hasAllFunnelAccess,
        _funnel_ids: funnelIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateUserState();
      toast.success("Acessos aos funis atualizados");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rolesByUser = useMemo(() => {
    const order: Record<OperationalRole, number> = {
      admin: 1,
      gestor: 2,
      consultor: 3,
      visualizador: 4,
    };
    const map = new Map<string, OperationalRole>();
    (allRoles.data ?? []).forEach((row) => {
      if (!(row.role in ROLE_LABELS)) return;
      const role = row.role as OperationalRole;
      const currentRole = map.get(row.user_id);
      if (!currentRole || order[role] < order[currentRole]) {
        map.set(row.user_id, role);
      }
    });
    return map;
  }, [allRoles.data]);

  const funnelAccessByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    (allFunnelAccess.data ?? []).forEach((row) => {
      const current = map.get(row.user_id) ?? [];
      current.push(row.funnel_id);
      map.set(row.user_id, current);
    });
    return map;
  }, [allFunnelAccess.data]);

  if (perms.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!perms.canManageTeam) return <Navigate to="/configuracoes" replace />;

  const visibleRoleOptions = perms.isAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((role) => role.value !== "admin");

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          Gerenciamento de usuarios
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Aprove acessos pendentes, gerencie funcoes operacionais e acompanhe o status de cada conta.
        </p>
      </div>

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

      {profiles.isLoading || allRoles.isLoading || allFunnelAccess.isLoading || funnels.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Usuario</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Funcao</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Acesso aos funis</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Recebe leads</th>
                </tr>
              </thead>
              <tbody>
                {(profiles.data ?? []).map((profile) => {
                  const role = rolesByUser.get(profile.id) ?? null;
                  const assignedFunnelIds = funnelAccessByUser.get(profile.id) ?? [];
                  return (
                    <UserRow
                      key={profile.id}
                      profile={profile}
                      role={role}
                      funnelOptions={funnels.data ?? []}
                      assignedFunnelIds={assignedFunnelIds}
                      currentUserId={user?.id ?? null}
                      currentUserIsAdmin={perms.isAdmin}
                      isBusy={
                        setRole.isPending
                        || setStatus.isPending
                        || setFunnelScope.isPending
                        || updateProfile.isPending
                      }
                      roleOptions={visibleRoleOptions}
                      onSaveName={(fullName) => updateProfile.mutate({ id: profile.id, full_name: fullName })}
                      onToggleReceive={(value) => updateProfile.mutate({ id: profile.id, can_receive_leads: value })}
                      onChangeRole={(nextRole) => setRole.mutate({ userId: profile.id, role: nextRole })}
                      onChangeStatus={(nextStatus) => setStatus.mutate({ userId: profile.id, status: nextStatus })}
                      onChangeFunnelScope={(hasAllFunnelAccess, funnelIds) =>
                        setFunnelScope.mutate({ userId: profile.id, hasAllFunnelAccess, funnelIds })
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
};

const UserRow = ({
  profile,
  role,
  funnelOptions,
  assignedFunnelIds,
  currentUserId,
  currentUserIsAdmin,
  isBusy,
  roleOptions,
  onSaveName,
  onToggleReceive,
  onChangeRole,
  onChangeStatus,
  onChangeFunnelScope,
}: {
  profile: Profile;
  role: OperationalRole | null;
  funnelOptions: Funnel[];
  assignedFunnelIds: string[];
  currentUserId: string | null;
  currentUserIsAdmin: boolean;
  isBusy: boolean;
  roleOptions: typeof ROLE_OPTIONS;
  onSaveName: (name: string) => void;
  onToggleReceive: (value: boolean) => void;
  onChangeRole: (role: OperationalRole) => void;
  onChangeStatus: (status: Exclude<UserAccessStatus, "pending">) => void;
  onChangeFunnelScope: (hasAllFunnelAccess: boolean, funnelIds: string[]) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [funnelPickerOpen, setFunnelPickerOpen] = useState(false);
  const [name, setName] = useState(profile.full_name ?? "");

  const status = profile.access_status as UserAccessStatus;
  const isOwner = isOwnerEmail(profile.email);
  const isSelf = currentUserId === profile.id;
  const isTargetAdmin = role === "admin";
  const canManageTarget = !isOwner && !isSelf && (currentUserIsAdmin || !isTargetAdmin);
  const roleValue = role ?? "__pending__";
  const canReceive = profile.can_receive_leads !== false;
  const canToggleReceive =
    canManageTarget &&
    status === "active" &&
    (role === "admin" || role === "gestor" || role === "consultor");
  const assignedFunnels = funnelOptions.filter((funnel) => assignedFunnelIds.includes(funnel.id));
  const hasSpecificFunnelSelection = assignedFunnels.length > 0;
  const funnelTriggerLabel = profile.has_all_funnel_access
    ? "Todos os funis"
    : assignedFunnels.length === 1
      ? assignedFunnels[0]?.name ?? "Selecionar funis especificos"
      : assignedFunnels.length > 1
        ? `${assignedFunnels.length} funis selecionados`
        : "Selecionar funis especificos";
  const funnelDescription = profile.has_all_funnel_access
    ? "Visualiza todos os negocios atuais e futuros."
    : assignedFunnels.length > 0
      ? assignedFunnels.map((funnel) => funnel.name).join(", ")
      : "Selecione ao menos um funil especifico ou use Todos os funis.";

  const handleSelectAllFunnels = () => {
    onChangeFunnelScope(true, []);
    setFunnelPickerOpen(false);
  };

  const handleToggleSpecificFunnel = (funnelId: string) => {
    const alreadySelected = assignedFunnelIds.includes(funnelId);
    if (alreadySelected) {
      const nextIds = assignedFunnelIds.filter((id) => id !== funnelId);
      if (nextIds.length === 0) {
        toast.warning("Selecione ao menos um funil especifico ou use Todos os funis.");
        return;
      }
      onChangeFunnelScope(false, nextIds);
      return;
    }

    const nextIds = funnelOptions
      .map((funnel) => funnel.id)
      .filter((id) => id === funnelId || assignedFunnelIds.includes(id));

    onChangeFunnelScope(false, nextIds);
  };

  return (
    <tr className="border-b hover:bg-muted/20 last:border-0">
      <td className="px-4 py-3">
        <div className="space-y-2">
          <div>
            <Select
              value={status === "pending" ? "__pending__" : status}
              onValueChange={(value) => {
                if (value !== "__pending__") onChangeStatus(value as Exclude<UserAccessStatus, "pending">);
              }}
              disabled={!canManageTarget || isBusy}
            >
              <SelectTrigger className="h-7 min-w-[120px] w-fit border-none bg-transparent px-0 text-left shadow-none focus:ring-0 focus:ring-offset-0">
                <SelectValue>
                  <Badge variant="outline" className={statusTone[status]}>
                    {STATUS_LABELS[status]}
                  </Badge>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {status === "pending" && (
                  <SelectItem value="__pending__" disabled>
                    Aguardando aprovacao
                  </SelectItem>
                )}
                {MANAGEABLE_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {status === "pending" && (
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning">
                <UserRoundCheck className="h-3 w-3" />
                Aguardando aprovacao
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {editing ? (
              <div className="flex items-center gap-1">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-medium text-foreground">
                    {profile.full_name || profile.email || "Sem nome"}
                  </p>
                  {isOwner && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Crown className="h-3 w-3" />
                      Owner
                    </Badge>
                  )}
                  {isSelf && (
                    <Badge variant="secondary" className="text-[10px]">
                      voce
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
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="space-y-1">
          <Select
            value={roleValue}
            onValueChange={(value) => {
              if (value !== "__pending__") onChangeRole(value as OperationalRole);
            }}
            disabled={!canManageTarget || isBusy}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue>
                {role ? ROLE_LABELS[role] : "Selecionar funcao"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {!role && (
                <SelectItem value="__pending__" disabled>
                  Aguardando aprovacao
                </SelectItem>
              )}
              {roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {role ? (
              <span>{ROLE_LABELS[role]}</span>
            ) : (
              <span>Acesso pendente de aprovacao</span>
            )}
            {isOwner && (
              <span className="inline-flex items-center gap-1 text-accent">
                <ShieldCheck className="h-3.5 w-3.5" />
                Conta principal protegida
              </span>
            )}
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="space-y-1">
          <Popover open={funnelPickerOpen} onOpenChange={setFunnelPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-56 justify-between bg-background font-normal"
                disabled={!canManageTarget || isBusy}
              >
                <span className="truncate text-left">{funnelTriggerLabel}</span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleSelectAllFunnels}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60",
                    profile.has_all_funnel_access && "bg-muted/60",
                  )}
                >
                  <Checkbox checked={profile.has_all_funnel_access} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">Todos os funis</p>
                    <p className="text-xs text-muted-foreground">
                      Inclui funis atuais e os novos que forem criados.
                    </p>
                  </div>
                  {profile.has_all_funnel_access && <Check className="h-4 w-4 text-accent" />}
                </button>

                <div className="my-2 h-px bg-border" />

                <div className="px-2 pb-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Selecionar funis especificos
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Escolher um funil especifico desmarca a opcao Todos os funis.
                  </p>
                </div>

                {funnelOptions.map((funnel) => {
                  const checked = !profile.has_all_funnel_access && assignedFunnelIds.includes(funnel.id);

                  return (
                    <button
                      key={funnel.id}
                      type="button"
                      onClick={() => handleToggleSpecificFunnel(funnel.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60",
                        checked && "bg-muted/60",
                      )}
                    >
                      <Checkbox checked={checked} />
                      <span className="min-w-0 flex-1 truncate text-foreground">{funnel.name}</span>
                      {checked && <Check className="h-4 w-4 text-accent" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <div className={cn(
            "text-xs",
            !profile.has_all_funnel_access && !hasSpecificFunnelSelection ? "text-warning" : "text-muted-foreground",
          )}>
            {funnelDescription}
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-center">
        <div className="flex flex-col items-center gap-2">
          <Switch
            checked={canReceive}
            onCheckedChange={onToggleReceive}
            disabled={!canToggleReceive || isBusy}
          />
          <span className="text-xs text-muted-foreground">
            {canToggleReceive ? "Elegivel" : status === "pending" ? "Pendente" : role === "visualizador" ? "Somente leitura" : "Bloqueado"}
          </span>
        </div>
      </td>
    </tr>
  );
};

export default TeamManagement;
