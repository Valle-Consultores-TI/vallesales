import { useEffect, useMemo, useRef, useState } from "react";
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
    body: "Acesse somente as informa\u00E7\u00F5es vinculadas ao seu c\u00F3digo.",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  {
    title: "Andamento atualizado",
    body: "Quando o projeto avan\u00E7ar, a etapa exibida tamb\u00E9m ser\u00E1 atualizada.",
    icon: <Waypoints className="h-4 w-4" />,
  },
  {
    title: "Etapas em linguagem simples",
    body: "Voc\u00EA acompanha o que foi feito, o que est\u00E1 em andamento e os pr\u00F3ximos passos.",
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
  const [shouldScrollToResult, setShouldScrollToResult] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

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
    scrollOnSuccess = false,
  }: {
    nextTrackingCode?: string;
    nextDocumentNumber?: string;
    silent?: boolean;
    scrollOnSuccess?: boolean;
  } = {}) => {
    const resolvedTrackingCode = sanitizeTrackingCodeInput(nextTrackingCode ?? trackingCode);
    const resolvedDocumentNumber = sanitizeDocumentNumberInput(nextDocumentNumber ?? documentNumber);

    if (!resolvedTrackingCode) {
      setTrackingData(null);
      setErrorMessage("Informe o c\u00F3digo de acompanhamento.");
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
      setShouldScrollToResult(false);
      return;
    }

    setLoadingLookup(false);
    setTrackingData(data as ProjectTrackingLookupResponse);
    setErrorMessage(null);
    if (scrollOnSuccess) setShouldScrollToResult(true);
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

  useEffect(() => {
    if (!shouldScrollToResult || !trackingData || !resultRef.current) return;

    resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    setShouldScrollToResult(false);
  }, [shouldScrollToResult, trackingData]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#2b3c46_0%,#314650_52%,#263740_100%)] text-white">
      <section className="relative overflow-hidden px-4 py-8 md:px-6 md:py-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.09),_transparent_42%)]" />
        <div className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl space-y-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.9fr)] lg:gap-8 xl:gap-10">
            <div className="flex h-full flex-col gap-8 lg:justify-between">
              <div className="space-y-7">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 shadow-sm backdrop-blur">
                  <img src={valleLogo} alt="Valle Consultores" className="h-7 w-auto object-contain" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
                    VALLE | Consultores
                  </span>
                </div>

                <div className="space-y-5">
                  <h1 className="max-w-[14ch] text-[clamp(2.75rem,7vw,4rem)] font-bold leading-[0.94] tracking-[-0.04em] text-white [text-wrap:balance] lg:max-w-[10ch]">
                    Acompanhe seu projeto
                  </h1>
                  <p className="max-w-xl text-base leading-7 text-white/76 sm:text-lg">
                    Consulte o andamento do seu processo com o c\u00F3digo enviado pela nossa equipe.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                {infoCards.map((card, index) => (
                  <Card
                    key={card.title}
                    className={`h-full border-white/10 bg-white/8 text-white shadow-none backdrop-blur ${
                      index === infoCards.length - 1 ? "sm:col-span-2" : ""
                    }`}
                  >
                    <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-white">
                        {card.icon}
                      </span>
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-white">{card.title}</p>
                        <p className="text-sm leading-6 text-white/72">{card.body}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="flex h-full">
              {loadingConfig ? (
                <Card className="w-full border-white/12 bg-white/[0.08] text-white shadow-[0_28px_60px_-30px_rgba(0,0,0,0.45)] backdrop-blur">
                  <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-6">
                    <Loader2 className="h-7 w-7 animate-spin text-accent" />
                    <p className="text-sm text-white/75">Buscando acompanhamento...</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="w-full self-start lg:my-auto">
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
                      void lookupTracking({
                        nextTrackingCode: normalizedCode,
                        nextDocumentNumber: documentNumber,
                        scrollOnSuccess: true,
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {trackingData ? (
            <div ref={resultRef}>
              <ProjectTrackingPanel data={trackingData} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default TrackingLookupPage;
