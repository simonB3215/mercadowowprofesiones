import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { handle } from '../src/server/router.js';
import { isOpenRequest } from '../src/server/auth.js';

// Las rutas protegidas devuelven 401 antes de tocar la base de datos, así que no hace falta PGlite.
const call = (path: string, init: RequestInit = {}) => handle(new Request('https://app.test' + path, init));

describe('Acceso con APP_PASSWORD', () => {
  const prev = process.env.APP_PASSWORD;
  beforeAll(() => { process.env.APP_PASSWORD = 'clave-de-prueba-123'; });
  afterAll(() => { if (prev === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = prev; });

  it('sin sesión se puede consultar; los cambios en datos compartidos responden 401', async () => {
    for (const [m, p] of [['PUT', '/api/settings'], ['POST', '/api/sync/prices'], ['POST', '/api/realms'], ['POST', '/api/profiles'], ['PUT', '/api/profiles/x'],
      ['DELETE', '/api/profiles/x'], ['POST', '/api/scenarios'], ['POST', '/api/plans'], ['DELETE', '/api/plans/x'], ['POST', '/api/ledger'], ['POST', '/api/ledger/x/void']]) {
      const r = await call(p, { method: m, body: m === 'DELETE' ? undefined : '{}' });
      expect(r.status, `${m} ${p}`).toBe(401);
      expect((await r.json()).auth).toBe(true);
    }
    expect(await (await call('/api/auth/status')).json()).toEqual({ required: true, authenticated: false });
  });

  it('qué peticiones quedan abiertas sin contraseña', () => {
    for (const p of ['/api/meta', '/api/opportunities', '/api/recipes/1', '/api/leveling', '/api/buy-or-craft', '/api/ledger', '/api/settings']) expect(isOpenRequest('GET', p), p).toBe(true);
    for (const p of ['/api/calculate', '/api/crafting-plan', '/api/tools/expected', '/api/me/characters/sync', '/api/battlenet/disconnect', '/api/auth/login']) expect(isOpenRequest('POST', p), p).toBe(true);
    expect(isOpenRequest('PUT', '/api/me/characters/1/professions/2')).toBe(true); // protegido por la sesión de Battle.net
    for (const [m, p] of [['PUT', '/api/settings'], ['POST', '/api/sync/prices'], ['POST', '/api/ledger'], ['DELETE', '/api/plans/x'], ['POST', '/api/profiles']]) expect(isOpenRequest(m, p), `${m} ${p}`).toBe(false);
  });

  it('contraseña incorrecta: 401 sin cookie', async () => {
    const r = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'otra' }) });
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('contraseña correcta: cookie HttpOnly, Secure y SameSite=Strict que abre la API', async () => {
    const r = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'clave-de-prueba-123' }) });
    expect(r.status).toBe(200);
    const c = r.headers.get('set-cookie')!;
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Strict/);
    const cookie = c.split(';')[0];
    expect(await (await call('/api/auth/status', { headers: { cookie } })).json()).toEqual({ required: true, authenticated: true });
    // Una cookie falsificada no sirve
    expect((await call('/api/ledger', { method: 'POST', body: '{}', headers: { cookie: 'mw_session=falsa' } })).status).toBe(401);
  });

  it('cambiar la contraseña invalida las sesiones anteriores', async () => {
    const r = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'clave-de-prueba-123' }) });
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    process.env.APP_PASSWORD = 'clave-nueva-456';
    expect(await (await call('/api/auth/status', { headers: { cookie } })).json()).toEqual({ required: true, authenticated: false });
    process.env.APP_PASSWORD = 'clave-de-prueba-123';
  });

  it('el cron no usa la sesión: sigue protegido por CRON_SECRET', async () => {
    const prevCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'cron-secreto';
    const r = await call('/api/cron/sync-prices');
    expect(r.status).toBe(401);
    expect((await r.json()).auth).toBeUndefined();
    if (prevCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prevCron;
  }, 60_000); // la ruta del cron abre la base de datos antes de comprobar el secreto

  it('sin APP_PASSWORD la API es abierta', async () => {
    const pw = process.env.APP_PASSWORD;
    delete process.env.APP_PASSWORD;
    expect(await (await call('/api/auth/status')).json()).toEqual({ required: false, authenticated: true });
    process.env.APP_PASSWORD = pw;
  });
});
