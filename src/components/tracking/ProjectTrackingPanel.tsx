import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  Clock3,
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

export const ProjectTrackingPanel = ({ data }: ProjectTrackingPanelProps) => {
  const displayName = data.displayName || data.companyName || data.clientName || "Projeto em acompanhamento";
  const completedSteps = data.steps.filter((step) => step.status === "completed").length;

  return (
    <div className="space-y-4">
      <div className="space-y-2 px-1">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
          Seu acompanhamento
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-white/74 sm:text-base">
          Veja abaixo a etapa atual e os pr\u00F3ximos passos do seu processo.
        </p>
      </div>

      <Card className="overflow-hidden border-white/10 bg-white/8 text-white shadow-[0_24px_50px_-26px_rgba(0,0,0,0.38)] backdrop-blur">
        <CardContent className="p-0">
          <div className="bg-[linear-gradient(135deg,#2b3c46_0%,#3b505b_100%)] px-5 py-6 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/74">
                  <Sparkles className="h-3.5 w-3.5" />
                  VALLE | Consultores
                </div>

                <div className="space-y-2">
                  <h3 className="text-3xl font-semibold tracking-tight text-white">
                    {displayName}
                  </h3>
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
              </div>

              <div className="min-w-[220px] rounded-[1.5rem] border border-white/10 bg-white/8 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                  Progresso geral
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold text-white">{data.progressPercentage}%</p>
                    <p className="text-sm text-white/68">
                      {completedSteps} de {data.steps.length} etapas conclu\u00EDdas
                    </p>
                  </div>
                </div>
                <Progress value={data.progressPercentage} className="mt-4 h-2.5 bg-white/12 [&>div]:bg-[linear-gradient(90deg,#b78362_0%,#d6a486_100%)]" />
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <Card className="border-[#e9ddcf] bg-[#f8f5f1] text-slate-900 shadow-none">
              <CardContent className="p-5 sm:p-6">
                <h3 className="text-xl font-semibold text-slate-900">
                  Etapas do projeto
                </h3>

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

                      <div className={cn("rounded-[1.5rem] border p-4 sm:p-5", statusSurfaceClassName[step.status])}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="max-w-3xl">
                            <p className="text-base font-semibold text-slate-900">{step.publicName}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{step.publicDescription}</p>
                          </div>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
                              step.status === "current"
                                ? "max-w-[168px] justify-center whitespace-normal border-[#c08a62] bg-[#c08a62] text-center leading-4 text-white"
                                : "w-fit border-[#e4d7c7] bg-white text-slate-600",
                            )}
                          >
                            {step.status === "current"
                              ? "Estamos trabalhando nessa etapa agora."
                              : STEP_STATUS_COPY[step.status]}
                            {step.status === "pending" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
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
};
