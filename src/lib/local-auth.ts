import { localSignIn, localSignUp } from "./local-auth.functions";

const TOKEN_KEY = "jcs_sdr_local_token";
const USER_KEY = "jcs_sdr_local_user";
const SESSION_COOKIE = "jcs_sdr_session";

export type LocalUser = { id: string; email: string; name: string; roles: string[] };

function persistSession(result: { token: string; user: LocalUser }) {
  localStorage.setItem(TOKEN_KEY, result.token);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(result.token)}; Path=/; Max-Age=28800; SameSite=Lax`;
  window.dispatchEvent(new Event("jcs-auth-change"));
}

export async function signInEmail(email: string, password: string) {
  persistSession(await localSignIn({ data: { email, password } }));
}

export async function signUpEmail(email: string, password: string, name: string, companyName: string) {
  persistSession(await localSignUp({ data: { email, password, name, companyName } }));
}

export function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  window.dispatchEvent(new Event("jcs-auth-change"));
}

export function getCurrentUser() {
  const value = localStorage.getItem(USER_KEY);
  return value ? (JSON.parse(value) as LocalUser) : null;
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}
