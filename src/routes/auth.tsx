import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInEmail, signUpEmail } from "@/lib/auth";
import { getCurrentUser } from "@/lib/local-auth";
import { Toaster, toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — JCS SDR" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getCurrentUser()) navigate({ to: "/dashboard" });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      queryClient.clear();
      await signInEmail(fd.get("email") as string, fd.get("password") as string);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      queryClient.clear();
      await signUpEmail(
        fd.get("email") as string,
        fd.get("password") as string,
        fd.get("name") as string,
      );
      toast.success("Conta criada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Toaster richColors position="top-right" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">JCS SDR</CardTitle>
          <CardDescription>Plataforma de prospecção automatizada</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form className="space-y-4 mt-4" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form className="space-y-4 mt-4" onSubmit={handleSignUp}>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Senha (mín. 6)</Label>
                  <Input id="password2" name="password" type="password" minLength={6} required />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  O primeiro usuário criado vira admin automaticamente.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
