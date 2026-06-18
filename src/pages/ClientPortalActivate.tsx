import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAcceptClientPortalInvitation, useClientPortalInvitationContext } from "@/hooks/useClientPortal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import valleSymbolWhite from "@/assets/valle-symbol-white.png";

const passwordSchema = z.string().min(6, "Minimo 6 caracteres").max(72);
const nameSchema = z.string().trim().min(2, "Nome muito curto").max(100);

const getLoginErrorMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (normalized.includes("email not confirmed")) {
    return "Seu e-mail ainda nao foi confirmado. Abra a mensagem recebida, confirme a conta e volte para este convite.";
  }
  return message;
};

export default function ClientPortalActivate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user, loading: authLoading, signOut } = useAuth();
  const invitationQuery = useClientPortalInvitationContext(token, !!token);
  const acceptInvitation = useAcceptClientPortalInvitation();

  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [autoAcceptAttempted, setAutoAcceptAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const invitation = invitationQuery.data?.invitation;
  const invitedEmail = invitation?.email ?? "";
  const invitedName = invitation?.fullName ?? "";

  useEffect(() => {
    if (!invitedName) return;
    setSignupName((current) => current || invitedName);
  }, [invitedName]);

  const isInvitationClosed =
    invitation?.status === "revoked" || invitation?.status === "expired";

  const runAcceptInvitation = useCallback(async () => {
    if (!token) return;

    try {
      const result = await acceptInvitation.mutateAsync({ token });
      toast.success(
        result.projectsLinked > 1
          ? `${result.projectsLinked} projetos foram liberados no seu portal.`
          : "Seu projeto foi liberado no portal.",
      );
      navigate(result.redirectPath, { replace: true });
    } catch {
      // Mutation hook already shows the error.
    }
  }, [acceptInvitation, navigate, token]);

  useEffect(() => {
    if (!token || !user || !invitation || invitation.status !== "pending" || autoAcceptAttempted) return;
    setAutoAcceptAttempted(true);
    void runAcceptInvitation();
  }, [autoAcceptAttempted, invitation, runAcceptInvitation, token, user]);

  const projectCountLabel = useMemo(() => {
    const count = invitation?.projectCount ?? invitation?.projects.length ?? 0;
    return count === 1 ? "1 projeto" : `${count} projetos`;
  }, [invitation]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      passwordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: invitedEmail,
      password: loginPassword,
    });
    setSubmitting(false);

    if (error) {
      toast.error(getLoginErrorMessage(error.message));
      return;
    }

    await runAcceptInvitation();
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      nameSchema.parse(signupName);
      passwordSchema.parse(signupPassword);
      if (signupPassword !== signupPasswordConfirm) {
        toast.error("As senhas nao coincidem.");
        return;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: invitedEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/cliente/ativar?token=${encodeURIComponent(token ?? "")}`,
        data: {
          full_name: signupName.trim(),
          portal_type: "cliente",
        },
      },
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message.includes("already") ? "Este e-mail ja esta cadastrado. Entre com sua senha." : error.message);
      return;
    }

    if (data.session) {
      await runAcceptInvitation();
      return;
    }

    toast.success("Conta criada! Confirme o e-mail recebido e depois volte por este mesmo link para concluir o acesso.");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-header p-4">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />

      <div className="relative w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center text-header-foreground">
          <div className="mb-4 rounded-2xl bg-white/10 p-3.5 shadow-elevated backdrop-blur">
            <img src={valleSymbolWhite} alt="Valle" className="h-8 w-8 object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Ativacao do Portal do Cliente</h1>
          <p className="mt-1 text-sm font-medium tracking-wider text-header-muted">
            Aceite o convite e entre direto nos projetos liberados para sua conta
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card className="border-0 shadow-elevated">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Resumo do convite</CardTitle>
              <CardDescription>
                Confira abaixo quais projetos ja ficarao disponiveis quando o acesso for concluido.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!token ? (
                <p className="text-sm text-destructive">Nenhum token de convite foi informado neste link.</p>
              ) : invitationQuery.isLoading || authLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando convite...
                </div>
              ) : invitationQuery.error || !invitation ? (
                <p className="text-sm text-destructive">
                  {invitationQuery.error instanceof Error ? invitationQuery.error.message : "Nao foi possivel carregar o convite."}
                </p>
              ) : (
                <>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Destino do convite</p>
                    <p className="mt-2 font-semibold text-foreground">{invitedEmail}</p>
                    {invitation.fullName ? <p className="mt-1 text-sm text-muted-foreground">{invitation.fullName}</p> : null}
                    <p className="mt-3 text-sm text-muted-foreground">
                      Status: <span className="font-medium text-foreground">{invitation.status}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Valido ate {new Date(invitation.expiresAt).toLocaleString("pt-BR")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Projetos liberados</p>
                        <p className="mt-1 font-semibold text-foreground">{projectCountLabel}</p>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-accent" />
                    </div>

                    <div className="mt-4 space-y-3">
                      {invitation.projects.map((project) => (
                        <div key={project.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                          <p className="font-medium text-foreground">{project.displayName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{project.flowLabel}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {project.statusLabel} • Codigo {project.trackingCode}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-elevated">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Concluir acesso</CardTitle>
              <CardDescription>
                Use o e-mail convidado para criar sua senha ou entrar na conta que recebera os projetos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!token ? null : invitationQuery.isLoading || authLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparando acesso...
                </div>
              ) : invitationQuery.error || !invitation ? (
                <p className="text-sm text-destructive">
                  {invitationQuery.error instanceof Error ? invitationQuery.error.message : "Nao foi possivel carregar o convite."}
                </p>
              ) : isInvitationClosed ? (
                <p className="text-sm text-muted-foreground">
                  Este convite nao esta mais ativo. Solicite um novo link para a equipe da Valle.
                </p>
              ) : user ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                    <p className="font-medium text-foreground">Voce esta conectado como {user.email ?? "conta sem e-mail"}.</p>
                    <p className="mt-1 text-muted-foreground">
                      O aceite so funciona se esta conta usar o mesmo e-mail do convite: {invitedEmail}.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button variant="accent" onClick={() => void runAcceptInvitation()} disabled={acceptInvitation.isPending}>
                      {acceptInvitation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Concluir acesso
                    </Button>
                    <Button variant="outline" onClick={() => void signOut()}>
                      Trocar de conta
                    </Button>
                  </div>
                </div>
              ) : (
                <Tabs defaultValue="login">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Ja tenho conta</TabsTrigger>
                    <TabsTrigger value="signup">Criar senha</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="mt-5 space-y-4">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="activate-login-email">E-mail convidado</Label>
                        <Input id="activate-login-email" value={invitedEmail} readOnly disabled />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="activate-login-password">Senha</Label>
                        <div className="relative">
                          <Input
                            id="activate-login-password"
                            type={showLoginPassword ? "text" : "password"}
                            value={loginPassword}
                            onChange={(event) => setLoginPassword(event.target.value)}
                            className="pr-10"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword((current) => !current)}
                            className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-r-md"
                            aria-label={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}
                          >
                            {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <Button type="submit" variant="accent" className="w-full font-semibold" disabled={submitting || acceptInvitation.isPending}>
                        {(submitting || acceptInvitation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Entrar e liberar projetos
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup" className="mt-5 space-y-4">
                    <form onSubmit={handleSignup} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="activate-signup-name">Nome completo</Label>
                        <Input
                          id="activate-signup-name"
                          value={signupName}
                          onChange={(event) => setSignupName(event.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="activate-signup-email">E-mail convidado</Label>
                        <Input id="activate-signup-email" type="email" value={invitedEmail} readOnly disabled />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="activate-signup-password">Senha</Label>
                        <div className="relative">
                          <Input
                            id="activate-signup-password"
                            type={showSignupPassword ? "text" : "password"}
                            value={signupPassword}
                            onChange={(event) => setSignupPassword(event.target.value)}
                            className="pr-10"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowSignupPassword((current) => !current)}
                            className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-r-md"
                            aria-label={showSignupPassword ? "Ocultar senha" : "Mostrar senha"}
                          >
                            {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Minimo 6 caracteres.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="activate-signup-password-confirm">Confirmar senha</Label>
                        <Input
                          id="activate-signup-password-confirm"
                          type="password"
                          value={signupPasswordConfirm}
                          onChange={(event) => setSignupPasswordConfirm(event.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" variant="accent" className="w-full font-semibold" disabled={submitting || acceptInvitation.isPending}>
                        {(submitting || acceptInvitation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Criar conta e liberar projetos
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
