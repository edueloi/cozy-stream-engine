import { getCurrentUser, signInEmail as signInLocal, signOut as signOutLocal } from "@/lib/local-auth";

export async function signInEmail(email: string, password: string) {
  await signInLocal(email, password);
}

export async function signUpEmail(_email: string, _password: string, _name: string) {
  throw new Error("Criação de contas será habilitada após a migração completa de usuários para MySQL.");
}

export async function signOut() {
  signOutLocal();
}

export async function getCurrentUserWithRole() {
  const user = getCurrentUser();
  return user ? { user, profile: { id: user.id, name: user.name, email: user.email }, roles: user.roles } : null;
}
