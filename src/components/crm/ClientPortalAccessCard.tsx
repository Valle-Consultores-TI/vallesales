import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Link2, Loader2, MailPlus, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  useClientPortalInvitationSetup,
  useClientPortalLink,
  useClientPortalUsers,
  useRevokeClientPortalInvitation,
  useSetClientPortalLink,
  useUpsertClientPortalInvitation,
} from "@/hooks/useClientPortal";
import type { Lead } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const INVITE_EXPIRY_OPTIONS = [
  { value: 3, label: "3 dias" },
  { value: 7, label: "7 dias" },
  { value: 14, label: "14 dias" },
] as const;

const normalizeEmail = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const buildInviteMessage = ({
  fullName,
  activationUrl,
  projectLabels,
}: {
  fullName: string;
  activationUrl: string;
  projectLabels: string[];
}) => [
  fullName ? `Ola, ${fullName}!` : "Ola!",
  "",
  "Seu acesso ao Portal do Cliente da Valle foi liberado.",
  "",
  "Projetos incluidos neste convite:",
  ...projectLabels.map((projectLabel) => `- ${projectLabel}`),
  "",
  "Acesse o link abaixo para criar sua senha ou entrar na sua conta:",
  activationUrl,
  "",
  "Se precisar, nossa equipe pode reenviar o acesso.",
].join("\n");

type ClientPortalAccessCardProps = {
  lead: Lead;
};

export const ClientPortalAccessCard = ({ lead }: ClientPortalAccessCardProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteDocument, setInviteDocument] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<number>(7);

  const invitationSetup = useClientPortalInvitationSetup(lead.id, true);
  const clientPortalUsers = useClientPortalUsers(true);
  const clientPortalLink = useClientPortalLink(lead.id, true);
  const setClientPortalLink = useSetClientPortalLink();
  const upsertInvitation = useUpsertClientPortalInvitation();
  const revokeInvitation = useRevokeClientPortalInvitation();

  const invitation = invitationSetup.data?.invitation ?? null;
  const projects = invitationSetup.data?.projects;
  const selectedClientUserId = clientPortalLink.data?.client_user?.id ?? "__none__";

  const resetInviteForm = useCallback(() => {
    const nextEmail = invitation?.email ?? invitationSetup.data?.lead.email ?? lead.email ?? "";
    const nextFullName =
      invitation?.fullName ??
      invitationSetup.data?.lead.full_name ??
      lead.contact_name ??
      lead.company_or_person ??
      "";
    const nextDocument = invitation?.documentNumber ?? invitationSetup.data?.lead.document_number ?? lead.cnpj ?? "";
    const nextProjectIds =
      invitation?.projectIds ??
      (projects ?? [])
        .filter((project) => {
          const linkedEmail = normalizeEmail(project.linkedClientUser?.email);
          return !project.linkedClientUser || !linkedEmail || linkedEmail === normalizeEmail(nextEmail);
        })
        .map((project) => project.id);

    setInviteEmail(nextEmail);
    setInviteFullName(nextFullName);
    setInviteDocument(nextDocument);
    setSelectedProjectIds(nextProjectIds);
    setExpiresInDays(7);
  }, [invitation?.documentNumber, invitation?.email, invitation?.fullName, invitation?.projectIds, invitationSetup.data, lead.cnpj, lead.company_or_person, lead.contact_name, lead.email, projects]);

  useEffect(() => {
    if (!invitationSetup.data) return;
    resetInviteForm();
  }, [invitationSetup.data, resetInviteForm]);

  const projectOptions = useMemo(
    () =>
      (projects ?? []).map((project) => {
        const linkedEmail = normalizeEmail(project.linkedClientUser?.email);
        const emailMatches = !linkedEmail || linkedEmail === normalizeEmail(inviteEmail);
        return {
          ...project,
          disabled: Boolean(project.linkedClientUser && !emailMatches),
        };
      }),
    [projects, inviteEmail],
  );

  const selectedProjectLabels = projectOptions
    .filter((project) => selectedProjectIds.includes(project.id))
    .map((project) => `${project.displayName} (${project.flowLabel})`);

  const invitationStatusLabel = (() => {
    switch (invitation?.status) {
      case "accepted":
        return "Convite aceito";
      case "expired":
        return "Convite expirado";
      case "revoked":
        return "Convite revogado";
      case "pending":
        return "Convite pendente";
      default:
        return "Nenhum convite enviado";
    }
  })();

  const withFullUrl = (activationPath: string) => {
    const origin = window.location.origin.replace(/\/$/, "");
    return `${origin}${activationPath}`;
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Nao foi possivel copiar agora.");
    }
  };

  const handleInviteMutation = async (copyMode: "none" | "message" | "link") => {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Informe o e-mail do convite.");
      return;
    }

    if (selectedProjectIds.length === 0) {
      toast.error("Selecione ao menos um projeto para este convite.");
      return;
    }

    try {
      const result = await upsertInvitation.mutateAsync({
        leadId: lead.id,
        email: normalizedEmail,
        fullName: inviteFullName.trim(),
        documentNumber: inviteDocument.trim(),
        projectIds: selectedProjectIds,
        expiresInDays,
      });

      const activationUrl = withFullUrl(result.activation_path);

      if (copyMode === "message") {
        await copyText(
          buildInviteMessage({
            fullName: inviteFullName.trim(),
            activationUrl,
            projectLabels: selectedProjectLabels,
          }),
          "Mensagem do convite copiada.",
        );
      }

      if (copyMode === "link") {
        await copyText(activationUrl, "Link de ativacao copiado.");
      }

      setModalOpen(false);
    } catch {
      // Toasts handled by mutation hook.
    }
  };

  const handleToggleProject = (projectId: string, checked: boolean) => {
    setSelectedProjectIds((current) =>
      checked ? Array.from(new Set([...current, projectId])) : current.filter((id) => id !== projectId),
    );
  };

  const handleClientPortalLinkChange = async (value: string) => {
    try {
      await setClientPortalLink.mutateAsync({
        leadId: lead.id,
        clientUserId: value === "__none__" ? null : value,
      });
    } catch {
      // Mutation already surfaces feedback.
    }
  };

  const handleRevokeInvitation = async () => {
    if (!invitation?.id) return;
    if (!confirm("Revogar este convite pendente do portal do cliente?")) return;

    try {
      await revokeInvitation.mutateAsync({ leadId: lead.id, invitationId: invitation.id });
    } catch {
      // Mutation already surfaces feedback.
    }
  };

  return (
    <>
      <Card className="col-span-2 space-y-4 border-accent/25 bg-accent/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Portal do cliente</h4>
            <p className="text-xs text-muted-foreground">
              Prepare um convite com um ou mais projetos para que o cliente crie a senha e entre direto no portal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-accent/30 bg-background/70">
              {invitationStatusLabel}
            </Badge>
            {clientPortalLink.data?.client_user ? (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                Usuario vinculado
              </Badge>
            ) : null}
          </div>
        </div>

        {invitationSetup.isLoading || clientPortalUsers.isLoading || clientPortalLink.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando configuracoes do portal...
          </div>
        ) : invitationSetup.error ? (
          <p className="text-sm text-destructive">
            {invitationSetup.error instanceof Error ? invitationSetup.error.message : "Nao foi possivel carregar o portal do cliente."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.9fr)]">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3 text-sm">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Projetos do convite</p>
                {invitation?.projects?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {invitation.projects.map((project) => (
                      <Badge key={project.id} variant="outline" className="border-accent/30 bg-background/80">
                        {project.displayName}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">Nenhum convite preparado ainda.</p>
                )}
              </div>

              <div className="rounded-xl border border-border/70 bg-background/70 p-3 text-sm">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Destino do convite</p>
                <p className="mt-1 font-medium text-foreground">{invitation?.email ?? inviteEmail ?? "Sem e-mail definido"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {invitation?.status === "pending" && invitation.expiresAt
                    ? `Valido ate ${new Date(invitation.expiresAt).toLocaleString("pt-BR")}`
                    : invitation?.status === "accepted" && invitation.acceptedAt
                      ? `Aceito em ${new Date(invitation.acceptedAt).toLocaleString("pt-BR")}`
                      : "Ao aceitar o link, os projetos serao vinculados a conta do cliente."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="accent" onClick={() => { resetInviteForm(); setModalOpen(true); }}>
                <MailPlus className="mr-2 h-4 w-4" />
                {invitation?.status === "pending" ? "Atualizar convite" : "Preparar convite"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleInviteMutation("message")}
                disabled={upsertInvitation.isPending || projectOptions.length === 0}
              >
                <Send className="mr-2 h-4 w-4" />
                Copiar mensagem
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleInviteMutation("link")}
                disabled={upsertInvitation.isPending || projectOptions.length === 0}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Copiar link
              </Button>
              {invitation?.status === "pending" ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => void handleRevokeInvitation()}>
                  Revogar convite
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.65fr)]">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fallback manual</p>
                <Select
                  value={selectedClientUserId}
                  onValueChange={(value) => void handleClientPortalLinkChange(value)}
                  disabled={setClientPortalLink.isPending}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione um usuario cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem usuario vinculado</SelectItem>
                    {(clientPortalUsers.data ?? []).map((portalUser) => (
                      <SelectItem key={portalUser.id} value={portalUser.id}>
                        {portalUser.full_name || portalUser.email || "Cliente sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se precisar, voce ainda pode liberar o acesso vinculando manualmente uma conta cliente.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Conta vinculada</p>
                <p className="mt-1 font-medium text-foreground">
                  {clientPortalLink.data?.client_user
                    ? clientPortalLink.data.client_user.full_name || clientPortalLink.data.client_user.email || "Usuario cliente"
                    : "Sem conta vinculada"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {clientPortalLink.data?.client_user?.access_status === "active"
                    ? "Portal pronto para login"
                    : "Aguardando aceite ou vinculacao manual"}
                </p>
              </div>
            </div>
          </>
        )}
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preparar convite do portal</DialogTitle>
            <DialogDescription>
              Selecione os projetos que ja devem ficar disponiveis quando o cliente ativar a conta.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="portal-invite-email">E-mail do convite</Label>
              <Input
                id="portal-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="cliente@empresa.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-invite-name">Nome exibido</Label>
              <Input
                id="portal-invite-name"
                value={inviteFullName}
                onChange={(event) => setInviteFullName(event.target.value)}
                placeholder="Nome do cliente"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-invite-document">CPF/CNPJ</Label>
              <Input
                id="portal-invite-document"
                value={inviteDocument}
                onChange={(event) => setInviteDocument(event.target.value)}
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-invite-expiry">Validade do link</Label>
              <Select value={String(expiresInDays)} onValueChange={(value) => setExpiresInDays(Number(value))}>
                <SelectTrigger id="portal-invite-expiry">
                  <SelectValue placeholder="Escolha a validade" />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Projetos incluidos no convite</Label>
              <span className="text-xs text-muted-foreground">{selectedProjectIds.length} selecionado(s)</span>
            </div>
            <ScrollArea className="h-72 rounded-xl border border-border/70">
              <div className="space-y-2 p-3">
                {projectOptions.map((project) => (
                  <label
                    key={project.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      project.disabled ? "cursor-not-allowed border-border/60 bg-muted/30 opacity-70" : "border-border/70 bg-background/70 hover:border-accent/40"
                    }`}
                  >
                    <Checkbox
                      checked={selectedProjectIds.includes(project.id)}
                      onCheckedChange={(checked) => handleToggleProject(project.id, checked === true)}
                      disabled={project.disabled}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{project.displayName}</p>
                        <Badge variant="outline">{project.flowLabel}</Badge>
                        <Badge variant="outline">{project.statusLabel}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Codigo {project.trackingCode} • Atualizado em {new Date(project.updatedAt).toLocaleString("pt-BR")}
                      </p>
                      {project.linkedClientUser ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Ja vinculado a {project.linkedClientUser.full_name || project.linkedClientUser.email || "uma conta cliente"}
                          {project.disabled ? " e bloqueado para outro e-mail." : "."}
                        </p>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Fechar
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleInviteMutation("link")} disabled={upsertInvitation.isPending}>
              <Copy className="mr-2 h-4 w-4" />
              Salvar e copiar link
            </Button>
            <Button type="button" variant="accent" onClick={() => void handleInviteMutation("message")} disabled={upsertInvitation.isPending}>
              {upsertInvitation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Salvar e copiar mensagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
