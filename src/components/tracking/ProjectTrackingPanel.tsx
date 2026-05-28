import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { STEP_STATUS_COPY } from "@/lib/project-tracking";
import { cn } from "@/lib/utils";
import type { ProjectTrackingLookupResponse, ProjectTrackingStep } from "@/types/project-tracking";

type ProjectTrackingPanelProps = {
  data: ProjectTrackingLookupResponse;
};

const statusBadgeClassName: Record<ProjectTrackingLookupResponse["status"], string> = {
  active: "border-accent/25 bg-accent/10 text-white",
  completed: "border-success/30 bg-success/15 text-white",
  paused: "border-white/14 bg-white/10 text-white",
};

const statusSurfaceClassName: Record<ProjectTrackingStep["status"], string> = {
  completed: "border-success/20 bg-success/5",
  current: "border-accent/35 bg-accent/10 shadow-[0_16px_34px_-24px_rgba(183,131,98,0.8)]",
  pending: "border-[#e8ddd1] bg-white",
};

const statusDotClassName: Record<ProjectTrackingStep["status"], string> = {
  completed: "bg-success text-success-foreground",
  current: "bg-accent text-accent-foreground",
  pending: "bg-secondary text-muted-foreground",
};

const StepIcon = ({ status }: { status: ProjectTrackingStep["status"] }) => {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "current") return <Clock3 className="h-4 w-4" />;
  return <Circle className="h-4 w-4" />;
};

export const ProjectTrackingPanel = ({ data }: ProjectTrackingPanelProps) => (
  <div className="space-y-6">
    <Card className="overflow-hidden border-white/10 bg-white/8 text-white shadow-[0_24px_50px_-26px_rgba(0,0,0,0.38)] backdrop-blur">
      <CardContent className="p-0">
        <div className="bg-[linear-gradient(135deg,#2b3c46_0%,#3b505b_100%)] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/74">
                <Sparkles className="h-3.5 w-3.5" />
                VALLE | Consultores
              </div>

              <div>
                <p className="text-sm text-white/72">Acompanhamento em andamento</p>
                <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white">
                  {data.displayName || data.companyName || data.clientName || "Projeto em acompanhamento"}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full border-white/12 bg-white/8 px-3 py-1 text-white">
                  <Building2 className="mr-1.5 h-3.5 w-3.5" />
                  {data.flowLabel}
                </Badge>
                <Badge variant="outline" className={cn("rounded-full px-3 py-1", statusBadgeClassName[data.status])}>
                  {data.statusLabel}
                </Badge>
              </div>
            </div>

            <div className="min-w-[220px] rounded-[1.5rem] border border-white/10 bg-white/8 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                Progresso geral
              </p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-semibold text-white">{data.progressPercentage}%</p>
                  <p className="text-sm text-white/68">
                    {data.steps.filter((step) => step.status === "completed").length} de {data.steps.length} etapas concluídas
                  </p>
                </div>
              </div>
              <Progress value={data.progressPercentage} className="mt-4 h-2.5 bg-white/12 [&>div]:bg-[linear-gradient(90deg,#b78362_0%,#d6a486_100%)]" />
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card className="border-[#e9ddcf] bg-white text-slate-900 shadow-none">
            <CardContent className="space-y-5 p-5">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Status atual
                </p>
                <h3 className="text-2xl font-semibold text-slate-900">
                  {data.status === "completed"
                    ? "Processo concluído"
                    : data.currentStep?.publicName || "Projeto em acompanhamento"}
                </h3>
              </div>

              <div className="rounded-[1.5rem] border border-[#ede3d8] bg-[#fbf8f4] p-4">
                <p className="text-sm leading-7 text-slate-700">
                  {data.status === "completed"
                    ? data.finalMessage || "Processo concluído! Agora seguimos com a rotina de atendimento da sua empresa."
                    : data.currentStep?.publicDescription || "Estamos organizando os próximos passos do seu projeto."}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-[#d9ece2] bg-[#f5fbf8] p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {data.status === "completed"
                    ? "Todas as etapas previstas foram concluídas."
                    : "Estamos trabalhando nesta etapa agora. Assim que houver avanço, esta página será atualizada automaticamente."}
                </p>
              </div>

              {data.previousPhase ? (
                <div className="rounded-[1.5rem] border border-[#e3d8ce] bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileText className="h-4 w-4 text-accent" />
                    {data.previousPhase.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {data.previousPhase.description}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-[#e9ddcf] bg-[#f8f5f1] text-slate-900 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Linha do tempo
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">
                    Veja em qual etapa estamos e o que ainda falta
                  </h3>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {data.steps.map((step, index) => (
                  <div key={step.stepKey} className="relative pl-16">
                    {index < data.steps.length - 1 ? (
                      <span className="absolute left-[1.42rem] top-10 h-[calc(100%-1rem)] w-px bg-[#ddcfbf]" />
                    ) : null}

                    <span
                      className={cn(
                        "absolute left-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold shadow-sm",
                        statusDotClassName[step.status],
                      )}
                    >
                      {step.status === "pending" ? index + 1 : <StepIcon status={step.status} />}
                    </span>

                    <div className={cn("rounded-[1.5rem] border p-4", statusSurfaceClassName[step.status])}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-slate-900">{step.publicName}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{step.publicDescription}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#e4d7c7] bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          {STEP_STATUS_COPY[step.status]}
                          {step.status !== "completed" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  </div>
);
