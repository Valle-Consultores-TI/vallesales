import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { ClientPortalAccessClaimCard } from "@/components/client/ClientPortalAccessClaimCard";
import { ClientPortalShell } from "@/components/client/ClientPortalShell";
import { ProjectTrackingPanel } from "@/components/tracking/ProjectTrackingPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientPortalProject } from "@/hooks/useClientPortal";

const ClientPortalTracking = () => {
  const { clientId = "" } = useParams<{ clientId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProjectId = searchParams.get("projeto");
  const projectQuery = useClientPortalProject(selectedProjectId, !!clientId);

  const activeProject = useMemo(() => {
    const projects = projectQuery.data?.projects ?? [];
    const activeProjectId = projectQuery.data?.activeProjectId;
    return projects.find((project) => project.id === activeProjectId) ?? null;
  }, [projectQuery.data?.activeProjectId, projectQuery.data?.projects]);

  if (projectQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        {projectQuery.error instanceof Error ? projectQuery.error.message : "Não foi possível carregar o acompanhamento."}
      </div>
    );
  }

  const { client, projects, tracking, claimRequired, claimDocumentValidationMode } = projectQuery.data;

  return (
    <ClientPortalShell
      clientId={clientId}
      client={client}
      activeTab="acompanhar"
      title="Acompanhe seus processos sem código público"
      description="Seu login já identifica os projetos vinculados ao seu cadastro. Basta escolher um deles para visualizar a etapa atual e os próximos passos."
    >
      <Card className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">Projetos vinculados</p>
              <p className="text-sm text-white/68">
                {projects.length > 1
                  ? "Selecione o projeto que deseja acompanhar."
                  : "O projeto conectado ao seu login aparece abaixo."}
              </p>
            </div>
            {projects.length > 1 ? (
              <div className="w-full sm:w-[320px]">
                <Label className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/60">Projeto</Label>
                <Select
                  value={projectQuery.data.activeProjectId ?? undefined}
                  onValueChange={(value) => {
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("projeto", value);
                      return next;
                    });
                  }}
                >
                  <SelectTrigger className="border-white/10 bg-white/10 text-white">
                    <SelectValue placeholder="Escolha um projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.displayName ?? "Projeto Valle"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {activeProject ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">{activeProject.displayName ?? "Projeto Valle"}</p>
              <p className="mt-1 text-sm text-white/68">{activeProject.flowLabel}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/55">
                Última atualização em {new Date(activeProject.updatedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/72">
              Nenhum projeto foi vinculado ao seu login ainda.
            </div>
          )}
        </CardContent>
      </Card>

      {claimRequired ? (
        <ClientPortalAccessClaimCard claimDocumentValidationMode={claimDocumentValidationMode} />
      ) : null}

      {tracking ? (
        <ProjectTrackingPanel data={tracking} />
      ) : (
        <Card className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
          <CardContent className="p-5 text-sm text-white/72">
            {claimRequired
              ? "Confirme o CPF/CNPJ do cadastro para liberar seus projetos e acompanhar as etapas por aqui."
              : "Assim que a equipe da Valle vincular um projeto ao seu cadastro, o acompanhamento aparecera aqui."}
          </CardContent>
        </Card>
      )}
    </ClientPortalShell>
  );
};

export default ClientPortalTracking;
