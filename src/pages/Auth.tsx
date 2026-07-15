import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { recordClientPortalLogin } from "@/hooks/useClientPortal";
import { useCustomerTrackingAccess } from "@/hooks/useCustomerTrackingAccess";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import valleSymbolWhite from "@/assets/valle-symbol-white.png";

const emailSchema = z.string().trim().email("E-mail invalido").max(255);
const passwordSchema = z.string().min(6, "Minimo 6 caracteres").max(72);
const nameSchema = z.string().trim().min(2, "Nome muito curto").max(100);

const isRecoveryRedirect = () => {
  if (typeof window === "undefined") return false;

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    searchParams.get("mode") === "recovery" ||
    searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  );
};

const readAuthParams = () => {
  if (typeof window === "undefined") {
    return {
      tokenHash: null,
      type: null,
      errorCode: null,
      errorDescription: null,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return {
    tokenHash: searchParams.get("token_hash") ?? hashParams.get("token_hash"),
    type: searchParams.get("type") ?? hashParams.get("type"),
    errorCode: searchParams.get("error_code") ?? hashParams.get("error_code"),
    errorDescription: searchParams.get("error_description") ?? hashParams.get("error_description"),
  };
};

const getAuthErrorMessage = (message: string, errorCode?: string | null) => {
  const normalized = message.toLowerCase();
  const normalizedCode = (errorCode ?? "").toLowerCase();

  if (normalizedCode === "otp_expired" || normalized.includes("expired")) {
    return "Este link de redefinicao expirou ou ja foi usado. Solicite um novo e-mail para continuar.";
  }

  if (normalizedCode === "otp_disabled") {
    return "A redefinicao por e-mail nao esta disponivel no momento.";
  }

  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos";
  if (normalized.includes("email not confirmed")) {
    return "Seu e-mail ainda nao foi confirmado. Abra a mensagem enviada pelo Supabase e confirme a conta antes de entrar.";
  }
  if (normalized.includes("invalid") && normalized.includes("link")) {
    return "O link informado nao e valido. Solicite um novo e-mail de redefinicao.";
  }
  if (normalized.includes("expired")) {
    return "Este link expirou. Solicite um novo e-mail de redefinicao.";
  }

  return message;
};

const getLoginErrorMessage = (message: string) => {
  return getAuthErrorMessage(message);
};

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { perms, hasCustomerTrackingAccess, isLoading: accessLoading } = useCustomerTrackingAccess(
    !!user && !location.pathname.startsWith("/cliente"),
  );
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showRecoveryPasswordConfirm, setShowRecoveryPasswordConfirm] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(() => isRecoveryRedirect());
  const [recoveryLinkError, setRecoveryLinkError] = useState<string | null>(null);
  const [verifyingRecoveryLink, setVerifyingRecoveryLink] = useState(false);
  const isClientPortal = location.pathname.startsWith("/cliente");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");

  const notifyClientPortalLogin = () => {
    if (!isClientPortal) return;

    void recordClientPortalLogin().catch((error) => {
      console.error("Nao foi possivel registrar o login do portal do cliente.", error);
    });
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") return;

      setRecoveryMode(true);
      setForgotPasswordMode(false);
      setRecoveryLinkError(null);
      toast.info("Defina uma nova senha para concluir a recuperacao do acesso.");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const { tokenHash, type, errorCode, errorDescription } = readAuthParams();

    if (errorCode || errorDescription) {
      const message = getAuthErrorMessage(errorDescription ?? "Nao foi possivel validar o link.", errorCode);
      setRecoveryMode(true);
      setForgotPasswordMode(false);
      setRecoveryLinkError(message);
      return;
    }

    if (!tokenHash || type !== "recovery") return;

    let cancelled = false;

    const verifyRecoveryLink = async () => {
      setVerifyingRecoveryLink(true);
      setRecoveryMode(true);
      setForgotPasswordMode(false);
      setRecoveryLinkError(null);

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });

      if (cancelled) return;

      setVerifyingRecoveryLink(false);

      if (error) {
        setRecoveryLinkError(getAuthErrorMessage(error.message, error.code));
        return;
      }

      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("token_hash");
      currentUrl.searchParams.delete("type");
      currentUrl.searchParams.delete("error_code");
      currentUrl.searchParams.delete("error_description");
      currentUrl.hash = "";
      window.history.replaceState({}, "", currentUrl.toString());
    };

    void verifyRecoveryLink();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (recoveryMode) return;
    if (authLoading || !user || accessLoading) return;

    if (isClientPortal) {
      if (perms.canAccessClientPortal) {
        navigate(`/cliente/${user.id}`, { replace: true });
        return;
      }

      if (perms.canAccessApp) {
        navigate("/", { replace: true });
      }
      return;
    }

    if (perms.canAccessApp) {
      navigate("/", { replace: true });
      return;
    }

    if (hasCustomerTrackingAccess) {
      navigate("/acompanhamento", { replace: true });
      return;
    }

    if (perms.canAccessClientPortal && !perms.canAccessApp) {
      navigate(`/cliente/${user.id}`, { replace: true });
      return;
    }

    navigate("/", { replace: true });
  }, [
    authLoading,
    accessLoading,
    hasCustomerTrackingAccess,
    isClientPortal,
    navigate,
    perms.canAccessApp,
    perms.canAccessClientPortal,
    recoveryMode,
    user,
  ]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    setLoading(false);

    if (error) {
      toast.error(getLoginErrorMessage(error.message));
      return;
    }

    toast.success("Bem-vindo!");
    if (!isClientPortal) {
      navigate("/", { replace: true });
      return;
    }

    notifyClientPortalLogin();
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();

    const targetEmail = recoveryEmail.trim() || loginEmail.trim();

    try {
      emailSchema.parse(targetEmail);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}${isClientPortal ? "/cliente/auth?mode=recovery" : "/auth?mode=recovery"}`,
    });
    setLoading(false);

    if (error) {
      toast.error(getAuthErrorMessage(error.message, error.code));
      return;
    }

    setRecoveryEmail(targetEmail);
    toast.success("Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha.");
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      nameSchema.parse(signupName);
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
      if (signupPassword !== signupPasswordConfirm) {
        toast.error("As senhas nao coincidem");
        return;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: `${window.location.origin}${isClientPortal ? "/cliente/auth" : "/"}`,
        data: {
          full_name: signupName,
          portal_type: isClientPortal ? "cliente" : "crm",
        },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message.includes("already") ? "Este e-mail ja esta cadastrado" : error.message);
      return;
    }

    if (data.session) {
      notifyClientPortalLogin();
      toast.success(
        isClientPortal
          ? "Conta de cliente criada com sucesso."
          : "Conta criada! Seu acesso sera liberado apos aprovacao.",
      );
      if (!isClientPortal) {
        navigate("/", { replace: true });
      }
      return;
    }

    toast.success(
      isClientPortal
        ? "Conta criada! Confirme o e-mail recebido e depois entre no portal do cliente."
        : "Conta criada! Agora confirme o e-mail recebido e depois faca login para entrar como pendente.",
    );
  };

  const handleRecoveryPasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      toast.error("Abra o link recebido por e-mail para autorizar a redefinicao da senha.");
      return;
    }

    try {
      passwordSchema.parse(recoveryPassword);
      if (recoveryPassword !== recoveryPasswordConfirm) {
        toast.error("As senhas nao coincidem");
        return;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: recoveryPassword,
    });
    setLoading(false);

    if (error) {
      toast.error(getAuthErrorMessage(error.message, error.code));
      return;
    }

    setRecoveryMode(false);
    setRecoveryPassword("");
    setRecoveryPasswordConfirm("");
    toast.success("Senha atualizada com sucesso.");

    if (isClientPortal) {
      notifyClientPortalLogin();
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      setLoading(false);
      toast.error("Falha ao entrar com Google");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-header p-4">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-header-foreground">
          <div className="mb-4 rounded-2xl bg-white/10 p-3.5 shadow-elevated backdrop-blur">
            <img src={valleSymbolWhite} alt="Valle" className="h-8 w-8 object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isClientPortal ? "Portal do Cliente" : "Valle Sales"}
          </h1>
          <p className="mt-1 text-sm font-medium tracking-wider text-header-muted">
            {isClientPortal ? "Acesso ao acompanhamento e indicacoes" : "CRM Comercial"}
          </p>
        </div>

        <Card className="animate-fade-in-up border-0 shadow-elevated">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {recoveryMode
                ? "Redefina sua senha"
                : forgotPasswordMode
                  ? "Recuperar acesso"
                  : isClientPortal
                    ? "Acesse sua area de cliente"
                    : "Acesse o sistema"}
            </CardTitle>
            <CardDescription>
              {recoveryMode
                ? recoveryLinkError
                  ? recoveryLinkError
                  : verifyingRecoveryLink
                    ? "Estamos validando o link de redefinicao com seguranca."
                    : user
                  ? "Defina uma nova senha para voltar a entrar com seguranca."
                  : "Abra o link enviado ao seu e-mail neste mesmo navegador para liberar a redefinicao."
                : forgotPasswordMode
                  ? "Enviaremos um link seguro para voce criar uma nova senha."
                  : isClientPortal
                    ? "Entre para acompanhar seus processos e enviar indicacoes"
                    : "Entre com suas credenciais corporativas"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recoveryMode ? (
              <form onSubmit={handleRecoveryPasswordUpdate} className="space-y-4">
                {recoveryLinkError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {recoveryLinkError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="recovery-password">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="recovery-password"
                      type={showRecoveryPassword ? "text" : "password"}
                      value={recoveryPassword}
                      onChange={(event) => setRecoveryPassword(event.target.value)}
                      className="pr-10"
                      placeholder="Minimo 6 caracteres"
                      disabled={!user || verifyingRecoveryLink || !!recoveryLinkError}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      aria-label={showRecoveryPassword ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={showRecoveryPassword}
                    >
                      {showRecoveryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="sr-only">{showRecoveryPassword ? "Ocultar senha" : "Mostrar senha"}</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recovery-password-confirm">Confirmar nova senha</Label>
                  <div className="relative">
                    <Input
                      id="recovery-password-confirm"
                      type={showRecoveryPasswordConfirm ? "text" : "password"}
                      value={recoveryPasswordConfirm}
                      onChange={(event) => setRecoveryPasswordConfirm(event.target.value)}
                      className="pr-10"
                      disabled={!user || verifyingRecoveryLink || !!recoveryLinkError}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryPasswordConfirm((current) => !current)}
                      className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      aria-label={showRecoveryPasswordConfirm ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={showRecoveryPasswordConfirm}
                    >
                      {showRecoveryPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="sr-only">
                        {showRecoveryPasswordConfirm ? "Ocultar senha" : "Mostrar senha"}
                      </span>
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="accent"
                  className="w-full font-semibold"
                  disabled={loading || !user || verifyingRecoveryLink || !!recoveryLinkError}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar nova senha
                </Button>

                {recoveryLinkError ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setRecoveryLinkError(null);
                      setRecoveryMode(false);
                      setRecoveryEmail(loginEmail.trim() || recoveryEmail.trim());
                      setForgotPasswordMode(true);
                    }}
                  >
                    Solicitar novo link
                  </Button>
                ) : null}
              </form>
            ) : forgotPasswordMode ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recovery-email">E-mail</Label>
                  <Input
                    id="recovery-email"
                    type="email"
                    value={recoveryEmail}
                    onChange={(event) => setRecoveryEmail(event.target.value)}
                    placeholder="Digite o e-mail da conta"
                    required
                  />
                </div>

                <Button type="submit" variant="accent" className="w-full font-semibold" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar link de recuperacao
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setForgotPasswordMode(false)}
                >
                  Voltar para o login
                </Button>
              </form>
            ) : (
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar conta</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="mt-5 space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">E-mail</Label>
                      <Input
                        id="login-email"
                        type="email"
                        value={loginEmail}
                        onChange={(event) => setLoginEmail(event.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">Senha</Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showLoginPassword ? "text" : "password"}
                          value={loginPassword}
                          onChange={(event) => setLoginPassword(event.target.value)}
                          className="pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((current) => !current)}
                          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          aria-label={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}
                          aria-pressed={showLoginPassword}
                        >
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          <span className="sr-only">{showLoginPassword ? "Ocultar senha" : "Mostrar senha"}</span>
                        </button>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="text-sm font-medium text-accent transition-colors hover:text-accent/80"
                          onClick={() => {
                            setRecoveryEmail(loginEmail.trim());
                            setForgotPasswordMode(true);
                          }}
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                    </div>

                    <Button type="submit" variant="accent" className="w-full font-semibold" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Entrar
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-5 space-y-4">
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Nome completo</Label>
                      <Input
                        id="signup-name"
                        value={signupName}
                        onChange={(event) => setSignupName(event.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email">E-mail</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        value={signupEmail}
                        onChange={(event) => setSignupEmail(event.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Senha</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        value={signupPassword}
                        onChange={(event) => setSignupPassword(event.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">Minimo 6 caracteres</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password-confirm">Confirmar senha</Label>
                      <Input
                        id="signup-password-confirm"
                        type="password"
                        value={signupPasswordConfirm}
                        onChange={(event) => setSignupPasswordConfirm(event.target.value)}
                        required
                      />
                    </div>

                    <Button type="submit" variant="accent" className="w-full font-semibold" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Criar conta
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}

            {!isClientPortal && !recoveryMode && !forgotPasswordMode ? (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 tracking-wider text-muted-foreground">Ou continue com</span>
                  </div>
                </div>

                <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285f4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34a853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#fbbc05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#ea4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
