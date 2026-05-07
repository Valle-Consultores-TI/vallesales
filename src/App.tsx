import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ActiveFunnelProvider } from "@/hooks/useActiveFunnel";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Contacts from "./pages/Contatos.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Configuracoes from "./pages/Configuracoes.tsx";
import AguardandoAprovacao from "./pages/AguardandoAprovacao.tsx";
import Auth from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry transient backend errors (ex: PGRST002 schema cache 503) com backoff
      retry: (failureCount, error: unknown) => {
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message?: unknown }).message || "")
              : "";
        // Não tentar de novo em erros de auth/permission
        if (msg.includes("JWT") || msg.includes("permission") || msg.includes("denied")) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="vallesales-theme">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ActiveFunnelProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/aguardando-aprovacao" element={<ProtectedRoute><AguardandoAprovacao /></ProtectedRoute>} />
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/contatos" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
                <Route path="/configuracoes/aparencia" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
                <Route path="/configuracoes/equipe" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
                <Route path="/equipe" element={<ProtectedRoute><Navigate to="/configuracoes/equipe" replace /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ActiveFunnelProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
