import {
  getCurrentUser,
  signInEmail as signInLocal,
  signOut as signOutLocal,
  signUpEmail as signUpLocal,
} from "@/lib/local-auth";

export async function signInEmail(email: string, password: string) {
  await signInLocal(email, password);
}

export async function signUpEmail(email: string, password: string, name: string, companyName: string) {
  await signUpLocal(email, password, name, companyName);
}

export async function signOut() {
  signOutLocal();
}

export async function getCurrentUserWithRole() {
  const user = getCurrentUser();
  return user ? { user, profile: { id: user.id, name: user.name, email: user.email }, roles: user.roles } : null;
}
