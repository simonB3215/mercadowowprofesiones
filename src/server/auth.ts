/**
 * Acceso con contraseña compartida (APP_PASSWORD).
 * - Sin APP_PASSWORD la API es abierta (desarrollo local y pruebas).
 * - Con APP_PASSWORD, consultar es abierto (GET y cálculos que no guardan nada) y lo de Battle.net usa su propia
 *   sesión por cuenta; solo los cambios en datos compartidos (ajustes, sincronizar precios, casas, perfiles,
 *   escenarios, planes y registro) exigen la cookie de sesión. El cron tiene su propio CRON_SECRET.
 * - La sesión es una cookie HttpOnly con un HMAC derivado de la contraseña: no hay estado en el servidor
 *   y cambiar la contraseña invalida todas las sesiones.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mw_session';
const MAX_AGE_S = 30 * 24 * 3600;

const password = () => process.env.APP_PASSWORD ?? '';
export const authRequired = () => password().length > 0;

const sessionToken = (pw: string) => createHmac('sha256', pw).update('mercado-wow-session-v1').digest('base64url');

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function isAuthenticated(req: Request): boolean {
  if (!authRequired()) return true;
  const c = readCookie(req, SESSION_COOKIE);
  return c !== null && safeEqual(c, sessionToken(password()));
}

/** Compara la contraseña en tiempo constante (sobre HMAC para igualar longitudes). */
export function checkPassword(candidate: unknown): boolean {
  if (!authRequired() || typeof candidate !== 'string') return false;
  return safeEqual(sessionToken(candidate), sessionToken(password()));
}

const isHttps = (req: Request) => new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';

export function sessionCookie(req: Request): string {
  return `${SESSION_COOKIE}=${sessionToken(password())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_S}${isHttps(req) ? '; Secure' : ''}`;
}

export function clearCookie(req: Request): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isHttps(req) ? '; Secure' : ''}`;
}

/** Cálculos por POST que no guardan nada. */
const OPEN_POSTS = new Set(['/api/calculate', '/api/crafting-plan', '/api/tools/expected']);

/** Peticiones que no exigen la contraseña: todo menos los cambios en datos compartidos. */
export function isOpenRequest(method: string, pathname: string): boolean {
  if (/^\/api\/auth(\/|$)/.test(pathname) || /^\/api\/cron\//.test(pathname)) return true;
  // Battle.net: cada usuario solo accede a lo suyo con su propia sesión (requireSession en battlenet.ts).
  if (/^\/api\/(battlenet|me)(\/|$)/.test(pathname)) return true;
  if (method === 'GET' || method === 'HEAD') return true;
  return method === 'POST' && OPEN_POSTS.has(pathname);
}
