import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInEmail, signUpEmail } from "@/lib/auth";
import { getCurrentUser } from "@/lib/local-auth";
import { Toaster, toast } from "sonner";
import { Eye, EyeOff, Loader2, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — JCS SDR" }] }),
  component: AuthPage,
});

type FieldErrors = Record<string, string>;

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (getCurrentUser()) navigate({ to: "/dashboard" });
  }, [navigate]);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function clearError(field: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }) as FieldErrors);
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = (fd.get("email") as string)?.trim();
    const password = fd.get("password") as string;

    const errors: FieldErrors = {};
    if (!email) errors.email = "Informe seu e-mail.";
    if (!password) errors.password = "Informe sua senha.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      queryClient.clear();
      await signInEmail(email, password);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível entrar. Verifique seus dados.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string)?.trim();
    const companyName = (fd.get("companyName") as string)?.trim();
    const email = (fd.get("email") as string)?.trim();
    const password = fd.get("password") as string;

    const errors: FieldErrors = {};
    if (!name) errors.name = "Informe seu nome.";
    if (!companyName) errors.companyName = "Informe o nome da sua empresa.";
    if (!email) errors.email = "Informe seu e-mail.";
    if (!password || password.length < 6) errors.password = "Mínimo de 6 caracteres.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      queryClient.clear();
      await signUpEmail(email, password, name, companyName);
      toast.success("Conta e organização criadas com sucesso.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4">
      <Toaster richColors position="top-right" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,oklch(from_var(--primary)_l_c_h_/_12%),transparent_55%),radial-gradient(circle_at_80%_80%,oklch(from_var(--primary)_l_c_h_/_8%),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.03] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <Card className="w-full max-w-md border-border/60 shadow-xl shadow-black/5 backdrop-blur-sm">
        <CardHeader className="items-center text-center pb-2">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary shadow-md shadow-primary/20">
            <Radar className="size-6 text-primary-foreground" strokeWidth={2.2} />
          </div>
          <CardTitle className="text-2xl tracking-tight">JCS SDR</CardTitle>
          <CardDescription>Plataforma de prospecção automatizada</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs
            defaultValue="signin"
            onValueChange={() => {
              setFieldErrors({});
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4 mt-4" onSubmit={handleSignIn} noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    ref={emailRef}
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    aria-invalid={!!fieldErrors.email}
                    className={cn(fieldErrors.email && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                    onChange={() => clearError("email")}
                  />
                  {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button
                      type="button"
                      onClick={() => toast.info("Esqueceu sua senha? Contate o administrador do sistema.")}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      aria-invalid={!!fieldErrors.password}
                      className={cn("pr-10", fieldErrors.password && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                      onChange={() => clearError("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
                </div>

                <Button type="submit" disabled={loading} className="w-full mt-2" size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4 mt-4" onSubmit={handleSignUp} noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder="Seu nome completo"
                    aria-invalid={!!fieldErrors.name}
                    className={cn(fieldErrors.name && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                    onChange={() => clearError("name")}
                  />
                  {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="companyName">Empresa</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    autoComplete="organization"
                    placeholder="Nome da sua empresa"
                    aria-invalid={!!fieldErrors.companyName}
                    className={cn(fieldErrors.companyName && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                    onChange={() => clearError("companyName")}
                  />
                  {fieldErrors.companyName ? (
                    <p className="text-xs text-destructive">{fieldErrors.companyName}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Cria uma organização própria e isolada para sua empresa.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email2">Email</Label>
                  <Input
                    id="email2"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    aria-invalid={!!fieldErrors.email}
                    className={cn(fieldErrors.email && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                    onChange={() => clearError("email")}
                  />
                  {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password2">Senha (mín. 6)</Label>
                  <div className="relative">
                    <Input
                      id="password2"
                      name="password"
                      type={showSignupPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      aria-invalid={!!fieldErrors.password}
                      className={cn("pr-10", fieldErrors.password && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                      onChange={() => clearError("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showSignupPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showSignupPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
                </div>

                <Button type="submit" disabled={loading} className="w-full mt-2" size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar conta"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Você vira administrador da organização criada.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
