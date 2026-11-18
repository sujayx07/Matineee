/**
 * Identity is deliberately lightweight: a display name remembered across
 * visits, and a per-tab session token per room so a refresh keeps your seat
 * (and role) while separate tabs act as separate people.
 */
const NAME_KEY = 'matinee:name';
const tokenKey = (code: string) => `matinee:session:${code}`;
const hostKeyKey = (code: string) => `matinee:hostKey:${code}`;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const session = {
  getName: () => safe(() => localStorage.getItem(NAME_KEY) ?? '', ''),
  setName: (name: string) => safe(() => localStorage.setItem(NAME_KEY, name), undefined),

  getToken: (code: string) => safe(() => sessionStorage.getItem(tokenKey(code)) ?? undefined, undefined),
  setToken: (code: string, token: string) => safe(() => sessionStorage.setItem(tokenKey(code), token), undefined),
  clearToken: (code: string) => safe(() => sessionStorage.removeItem(tokenKey(code)), undefined),

  getHostKey: (code: string) => safe(() => sessionStorage.getItem(hostKeyKey(code)) ?? undefined, undefined),
  setHostKey: (code: string, key: string) => safe(() => sessionStorage.setItem(hostKeyKey(code), key), undefined),
  clearHostKey: (code: string) => safe(() => sessionStorage.removeItem(hostKeyKey(code)), undefined),
};
