import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, LockKeyhole, Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS, STATUS_LABELS, type OperationalRole, type UserAccessStatus } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_OPTIONS,
  normalizeNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@/lib/notifications";
import type { Profile } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const statusTone: Record<UserAccessStatus, string> = {
  pending: "bg-warning/12 text-warning border-warning/25",
  active: "bg-success/12 text-success border-success/25",
  suspended: "bg-destructive/12 text-destructive border-destructive/25",
  inactive: "bg-muted text-muted-foreground border-border",
};

export const MyAccountSettings = ({
  profile,
  primaryRole,
}: {
  profile: Profile | null;
  primaryRole: OperationalRole | null;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setFullName(profile?.full_name ?? user?.user_metadata?.full_name ?? "");
    setNotificationPreferences(normalizeNotificationPreferences(profile?.notification_preferences ?? null));
  }, [profile, user?.user_metadata?.full_name]);

  const status = (profile?.access_status ?? "pending") as UserAccessStatus;
  const roleLabel = primaryRole ? ROLE_LABELS[primaryRole] : "Aguardando aprovacao";
  const email = profile?.email ?? user?.email ?? "";
  const initialNotificationPreferences = useMemo(
    () => normalizeNotificationPreferences(profile?.notification_preferences ?? null),
    [profile?.notification_preferences],
  );

  const hasChanges =
    fullName.trim() !== (profile?.full_name ?? "") ||
    JSON.stringify(notificationPreferences) !== JSON.stringify(initialNotificationPreferences);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sessao de usuario nao encontrada.");

      const payload = {
        full_name: fullName.trim() || null,
        notification_preferences: notificationPreferences,
      };

      const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my_profile"] }),
        queryClient.invalidateQueries({ queryKey: ["profiles"] }),
      ]);
      toast.success("Minha conta foi atualizada.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 6) {
        throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
      }

      if (newPassword !== confirmPassword) {
        throw new Error("As senhas informadas nao coincidem.");
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      setPasswordDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada com sucesso.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Minha conta</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Visualize e gerencie seus dados pessoais, acesso e preferencias individuais.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Dados da conta</CardTitle>
            <CardDescription>
              Informacoes basicas da conta logada. A funcao e o e-mail ficam protegidos para manter o acesso seguro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="account-name">Nome</Label>
                <Input
                  id="account-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={120}
                  placeholder="Como voce quer aparecer no CRM"
                />
                <p className="text-xs text-muted-foreground">
                  Esse nome aparece nas telas do CRM e pode ser atualizado por voce.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-role">Funcao / cargo</Label>
                <Input id="account-role" value={roleLabel} readOnly disabled />
                <p className="text-xs text-muted-foreground">
                  Sua funcao operacional e informativa nesta tela e nao pode ser alterada pela propria conta.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-email">E-mail</Label>
                <Input id="account-email" value={email} readOnly disabled />
                <p className="text-xs text-muted-foreground">
                  Este e-mail e usado para autenticacao. Qualquer alteracao precisa passar por validacao segura.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">Senha</p>
                <p className="text-sm text-muted-foreground">
                  A senha atual nunca e exibida. Use um fluxo seguro para definir uma nova.
                </p>
              </div>
              <Button variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                <LockKeyhole className="h-4 w-4" />
                Alterar senha
              </Button>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveProfile.mutate()} disabled={!hasChanges || saveProfile.isPending}>
                {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar alteracoes
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Resumo de acesso</CardTitle>
            <CardDescription>Status atual da sua conta dentro do CRM.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-accent/10 p-2 text-accent">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{fullName.trim() || email || "Conta sem nome"}</p>
                  <p className="truncate text-sm text-muted-foreground">{email || "Sem e-mail informado"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">Status</span>
                </div>
                <Badge variant="outline" className={statusTone[status]}>
                  {STATUS_LABELS[status]}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">Login principal</span>
                </div>
                <span className="text-sm text-muted-foreground">E-mail e senha</span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">Notificacoes ativas</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {Object.values(notificationPreferences).filter(Boolean).length} de {NOTIFICATION_OPTIONS.length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Preferencias de notificacao</CardTitle>
            <CardDescription>
              Escolha quais categorias de aviso devem aparecer no sino e na lista de notificacoes do CRM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {NOTIFICATION_OPTIONS.map((option) => (
              <div key={option.key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{option.label}</p>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
                <Switch
                  checked={notificationPreferences[option.key]}
                  onCheckedChange={(checked) =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      [option.key]: checked,
                    }))
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          setPasswordDialogOpen(open);
          if (!open) {
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para a conta atual. A senha antiga nao e exibida em nenhum momento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Minimo 6 caracteres"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordDialogOpen(false);
                setNewPassword("");
                setConfirmPassword("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={() => changePassword.mutate()} disabled={changePassword.isPending}>
              {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              Atualizar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
