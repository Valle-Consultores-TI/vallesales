import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Copy, Link2, Loader2, MailPlus, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  useClientPortalInvitationProjectSearch,
  useFindClientPortalInvitationProject,
  useClientPortalInvitationSetup,
  useRevokeClientPortalInvitation,
  useUpsertClientPortalInvitation,
} from "@/hooks/useClientPortal";
import type { ClientPortalInvitationProject } from "@/types/client-portal";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

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
  const [projectLookupCode, setProjectLookupCode] = useState("");
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [extraProjects, setExtraProjects] = useState<ClientPortalInvitationProject[]>([]);
  const deferredProjectSearchQuery = useDeferredValue(projectSearchQuery);

  const invitationSetup = useClientPortalInvitationSetup(lead.id, true);
  const upsertInvitation = useUpsertClientPortalInvitation();
  const findInvitationProject = useFindClientPortalInvitationProject();
  const projectSearch = useClientPortalInvitationProjectSearch(
    lead.id,
    inviteEmail,
    deferredProjectSearchQuery,
    modalOpen && projectSearchOpen,
  );
  const revokeInvitation = useRevokeClientPortalInvitation();

  const invitation = invitationSetup.data?.invitation ?? null;
  const projects = invitationSetup.data?.projects;

  const resetInviteForm = useCallback(() => {
    const setupProjects = invitationSetup.data?.projects ?? [];
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
      setupProjects
        .filter((project) => {
          const linkedEmail = normalizeEmail(project.linkedClientUser?.email);
          return !project.linkedClientUser || !linkedEmail || linkedEmail === normalizeEmail(nextEmail);
        })
        .map((project) => project.id);
    const nextExtraProjects = (invitation?.projects ?? []).filter(
      (project) => !setupProjects.some((setupProject) => setupProject.id === project.id),
    );

    setInviteEmail(nextEmail);
    setInviteFullName(nextFullName);
    setInviteDocument(nextDocument);
    setProjectLookupCode("");
    setProjectSearchQuery("");
    setProjectSearchOpen(false);
    setSelectedProjectIds(nextProjectIds);
    setExtraProjects(nextExtraProjects);
    setExpiresInDays(7);
  }, [invitation?.documentNumber, invitation?.email, invitation?.fullName, invitation?.projectIds, invitation?.projects, invitationSetup.data, lead.cnpj, lead.company_or_person, lead.contact_name, lead.email]);

  useEffect(() => {
    if (!invitationSetup.data) return;
    resetInviteForm();
  }, [invitationSetup.data, resetInviteForm]);

  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          [...(projects ?? []), ...extraProjects].map((project) => [project.id, project] as const),
        ).values(),
      ).map((project) => {
        const linkedEmail = normalizeEmail(project.linkedClientUser?.email);
        const emailMatches = !linkedEmail || linkedEmail === normalizeEmail(inviteEmail);
        return {
          ...project,
          disabled: Boolean(project.linkedClientUser && !emailMatches),
        };
      }),
    [projects, extraProjects, inviteEmail],
  );

  const selectedProjectLabels = projectOptions
    .filter((project) => selectedProjectIds.includes(project.id))
    .map((project) => `${project.displayName} (${project.flowLabel})`);

  const searchedProjectOptions = useMemo(
    () =>
      (projectSearch.data ?? []).filter(
        (project) => !projectOptions.some((selectedProject) => selectedProject.id === project.id),
      ),
    [projectOptions, projectSearch.data],
  );

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

    const blockedProject = projectOptions.find(
      (project) => selectedProjectIds.includes(project.id) && project.disabled,
    );
    if (blockedProject) {
      toast.error(`O projeto ${blockedProject.displayName} ja esta vinculado a outro e-mail do portal.`);
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

  const appendProjectOption = useCallback((project: ClientPortalInvitationProject) => {
    setExtraProjects((current) => {
      if (current.some((currentProject) => currentProject.id === project.id)) return current;
      return [...current, project];
    });
    setSelectedProjectIds((current) =>
      current.includes(project.id) ? current : [...current, project.id],
    );
  }, []);

  const handleAddProjectByCode = async () => {
    const trackingCode = projectLookupCode.trim().toUpperCase();
    if (!trackingCode) {
      toast.error("Informe o codigo do projeto para adicionar.");
      return;
    }

    try {
      const result = await findInvitationProject.mutateAsync({
        leadId: lead.id,
        trackingCode,
      });

      appendProjectOption(result.project);
      setProjectLookupCode("");
      toast.success("Projeto adicionado ao convite.");
    } catch {
      // Mutation hook already surfaces feedback.
    }
  };

  const handleSelectAvailableProject = (project: ClientPortalInvitationProject) => {
    appendProjectOption(project);
    setProjectSearchOpen(false);
    setProjectSearchQuery("");
    toast.success("Projeto adicionado ao convite.");
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
          </div>
        </div>

        {invitationSetup.isLoading ? (
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
            <div className="rounded-xl border border-border/70 bg-background/60 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="min-w-0 space-y-2">
                  <Label>Adicionar projeto disponivel</Label>
                  <Popover open={projectSearchOpen} onOpenChange={setProjectSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={projectSearchOpen}
                        className="w-full justify-between"
                      >
                        <span className="truncate text-left">
                          {inviteEmail.trim()
                            ? "Selecionar projeto disponivel"
                            : "Preencha o e-mail para ampliar os projetos elegiveis"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          value={projectSearchQuery}
                          onValueChange={setProjectSearchQuery}
                          placeholder="Buscar por codigo, empresa ou cliente"
                        />
                        <CommandList>
                          {projectSearch.isLoading ? (
                            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Buscando projetos disponiveis...
                            </div>
                          ) : null}
                          {projectSearch.error ? (
                            <div className="px-3 py-4 text-sm text-destructive">
                              {projectSearch.error instanceof Error
                                ? projectSearch.error.message
                                : "Nao foi possivel carregar os projetos disponiveis."}
                            </div>
                          ) : null}
                          {!projectSearch.isLoading && !projectSearch.error ? (
                            <>
                              <CommandEmpty>Nenhum projeto disponivel encontrado.</CommandEmpty>
                              <CommandGroup>
                                {searchedProjectOptions.map((project) => (
                                  <CommandItem
                                    key={project.id}
                                    value={`${project.trackingCode} ${project.displayName} ${project.flowLabel}`}
                                    onSelect={() => handleSelectAvailableProject(project)}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <Check className={cn("h-4 w-4 opacity-0")} />
                                        <span className="truncate font-medium">{project.displayName}</span>
                                      </div>
                                      <p className="pl-6 text-xs text-muted-foreground">
                                        Codigo {project.trackingCode} - {project.flowLabel} - {project.statusLabel}
                                      </p>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          ) : null}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    A lista consulta o backend e mostra projetos elegiveis para este convite.
                  </p>
                </div>

                <div className="min-w-0 space-y-2">
                  <Label htmlFor="portal-invite-project-code">Adicionar pelo codigo do projeto</Label>
                  <div className="flex gap-2">
                    <Input
                      id="portal-invite-project-code"
                      value={projectLookupCode}
                      onChange={(event) => setProjectLookupCode(event.target.value.toUpperCase())}
                      placeholder="Ex.: VAL-12345"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleAddProjectByCode()}
                      disabled={findInvitationProject.isPending}
                    >
                      {findInvitationProject.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se voce ja souber o codigo, pode adicionar direto por aqui.
                  </p>
                </div>
              </div>
            </div>

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
