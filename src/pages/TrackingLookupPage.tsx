import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Loader2, ShieldCheck, Sparkles, Waypoints } from "lucide-react";

import { ProjectTrackingPanel } from "@/components/tracking/ProjectTrackingPanel";
import { TrackingLookupForm } from "@/components/tracking/TrackingLookupForm";
import { Card, CardContent } from "@/components/ui/card";
import valleLogo from "@/assets/valle-logo-full.png";
import { supabase } from "@/integrations/supabase/client";
import {
  GENERIC_TRACKING_LOOKUP_ERROR,
  formatDocumentNumberInput,
  sanitizeDocumentNumberInput,
  sanitizeTrackingCodeInput,
} from "@/lib/project-tracking";
import type { ProjectTrackingConfigResponse, ProjectTrackingLookupResponse } from "@/types/project-tracking";

const infoCards = [
  {
    title: "Consulta segura",
    body: "Use o código enviado pela nossa equipe para acompanhar somente o seu processo.",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  {
    title: "Atualização contínua",
    body: "Sempre que o projeto avançar, esta página refletirá a nova etapa do acompanhamento.",
    icon: <Waypoints className="h-4 w-4" />,
  },
  {
    title: "Leitura simples",
    body: "Traduzimos as etapas internas para uma visão clara, objetiva e fácil de acompanhar.",
    icon: <Sparkles className="h-4 w-4" />,
  },
] as const;

const readFunctionErrorMessage = async (error: FunctionsHttpError) => {
  try {
    const data = await error.context.json();
    if (typeof data === "string" && data.trim()) return data;
    if (typeof data === "object" && data !== null && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  } catch {
    try {
      const fallbackText = await error.context.text();
      if (fallbackText.trim()) return fallbackText;
    } catch {
      // Ignore parsing fallback failures.
    }
  }

  return error.message;
};

const TrackingLookupPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trackingCode, setTrackingCode] = useState(searchParams.get("codigo") ?? "");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentValidationMode, setDocumentValidationMode] = useState<ProjectTrackingConfigResponse["documentValidationMode"]>("optional");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<ProjectTrackingLookupResponse | null>(null);

  const normalizedQueryCode = useMemo(
    () => sanitizeTrackingCodeInput(searchParams.get("codigo") ?? ""),
    [searchParams],
  );

  useEffect(() => {
    const loadConfig = async () => {
      setLoadingConfig(true);
      const { data, error } = await supabase.functions.invoke("public-project-tracking", {
        body: { action: "config" },
      });

      if (!error && data?.documentValidationMode) {
        setDocumentValidationMode((data as ProjectTrackingConfigResponse).documentValidationMode);
      }

      setLoadingConfig(false);
    };

    void loadConfig();
  }, []);

  const lookupTracking = async ({
    nextTrackingCode,
    nextDocumentNumber,
    silent = false,
  }: {
    nextTrackingCode?: string;
    nextDocumentNumber?: string;
    silent?: boolean;
  } = {}) => {
    const resolvedTrackingCode = sanitizeTrackingCodeInput(nextTrackingCode ?? trackingCode);
    const resolvedDocumentNumber = sanitizeDocumentNumberInput(nextDocumentNumber ?? documentNumber);

    if (!resolvedTrackingCode) {
      setTrackingData(null);
      setErrorMessage("Informe o código de acompanhamento.");
      return;
    }

    if (documentValidationMode === "required" && !resolvedDocumentNumber) {
      setTrackingData(null);
      setErrorMessage("Informe o CPF ou CNPJ para continuar.");
      return;
    }

    setLoadingLookup(true);
    if (!silent) setErrorMessage(null);

    const { data, error } = await supabase.functions.invoke("public-project-tracking", {
      body: {
        action: "lookup",
        trackingCode: resolvedTrackingCode,
        documentNumber: resolvedDocumentNumber || null,
      },
    });

    if (error) {
      setLoadingLookup(false);
      const fallbackMessage = error instanceof FunctionsHttpError
        ? await readFunctionErrorMessage(error)
        : error.message;
      setTrackingData(null);
      setErrorMessage(fallbackMessage || GENERIC_TRACKING_LOOKUP_ERROR);
      return;
    }

    setLoadingLookup(false);
    setTrackingData(data as ProjectTrackingLookupResponse);
    setErrorMessage(null);
  };

  useEffect(() => {
    if (!normalizedQueryCode || loadingConfig) return;
    setTrackingCode(normalizedQueryCode);
    void lookupTracking({ nextTrackingCode: normalizedQueryCode, silent: true });
  }, [loadingConfig, normalizedQueryCode]);

  useEffect(() => {
    if (!trackingData?.trackingCode) return;

    const intervalId = window.setInterval(() => {
      void lookupTracking({
        nextTrackingCode: trackingCode,
        nextDocumentNumber: documentNumber,
        silent: true,
      });
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [documentNumber, trackingCode, trackingData?.trackingCode]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#2b3c46_0%,#314650_52%,#263740_100%)] text-white">
      <section className="relative overflow-hidden px-4 py-8 md:px-6 md:py-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.09),_transparent_42%)]" />
        <div className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl space-y-6">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 shadow-sm backdrop-blur">
                <img src={valleLogo} alt="Valle Consultores" className="h-7 w-auto object-contain" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
                  VALLE | Consultores
                </span>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-[2.7rem]">
                  Acompanhe o andamento do seu projeto
                </h1>
                <p className="max-w-2xl text-lg font-medium text-white/88 sm:text-xl">
                  Digite seu código de acompanhamento para ver em qual etapa estamos.
                </p>
                <p className="max-w-xl text-sm leading-7 text-white/74 sm:text-base">
                  Veja em qual etapa estamos e o que ainda falta para concluir o processo. A consulta é feita em uma página única, com atualização automática e linguagem simples.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {infoCards.map((card) => (
                  <Card key={card.title} className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
                    <CardContent className="space-y-2 p-4">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/12 text-white">
                        {card.icon}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{card.title}</p>
                        <p className="mt-1 text-xs leading-5 text-white/72">{card.body}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {loadingConfig ? (
              <Card className="border-white/10 bg-white/8 text-white shadow-[0_20px_44px_-26px_rgba(0,0,0,0.35)] backdrop-blur">
                <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-6">
                  <Loader2 className="h-7 w-7 animate-spin text-accent" />
                  <p className="text-sm text-white/75">Preparando seu acompanhamento...</p>
                </CardContent>
              </Card>
            ) : (
              <TrackingLookupForm
                trackingCode={trackingCode}
                documentNumber={documentNumber}
                documentValidationMode={documentValidationMode}
                loading={loadingLookup}
                errorMessage={errorMessage}
                onTrackingCodeChange={(value) => setTrackingCode(sanitizeTrackingCodeInput(value))}
                onDocumentNumberChange={(value) => setDocumentNumber(formatDocumentNumberInput(value))}
                onSubmit={(event) => {
                  event.preventDefault();
                  const normalizedCode = sanitizeTrackingCodeInput(trackingCode);
                  setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    if (normalizedCode) next.set("codigo", normalizedCode);
                    else next.delete("codigo");
                    return next;
                  });
                  void lookupTracking({ nextTrackingCode: normalizedCode, nextDocumentNumber: documentNumber });
                }}
              />
            )}
          </div>

          {trackingData ? <ProjectTrackingPanel data={trackingData} /> : null}
        </div>
      </section>
    </div>
  );
};

export default TrackingLookupPage;
