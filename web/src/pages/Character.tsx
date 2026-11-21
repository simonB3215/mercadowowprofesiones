/**
 * «Mi personaje» (PC-13): conectar Battle.net, elegir un personaje propio, ver sus profesiones (oficial o manual, con
 * procedencia), calcular la ruta más rápida o más barata, guardarla y registrar el progreso.
 * Sin conexión (o sin credenciales en el servidor) funciona en modo manual: el nivel se escribe a mano.
 */
import React, { useEffect, useRef, useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, PageHead, Money, toQ, age, hoursSince, dt, hashQuery } from '../lib.js';
import { ItemLabel } from '../icons.js';
import { SkillColor, HowToLearn } from './Leveling.js';
import { MatChip, PatternNote, RouteGuide, RouteProgress, ShoppingPanel, StepAlternatives, StepCheck, AvoidedList, stepKey, useStepsDone, type Avoided } from '../RouteTools.js';
import { CharacterSheet, ProfessionTiles, PROFESSION_NAME_ES, useScrollTo } from './CharacterSheet.js';
import { readChosen, writeChosen } from '../myCharacters.js';
import {
  IdentificationCard, SignIn, SignOut, ArrowsClockwise, Warning, CheckCircle, Info, Lightning, PiggyBank, Timer, ListNumbers, Table,
  ShoppingCart, FloppyDisk, ArrowSquareOut, Trash, PencilSimple, XCircle, Flag,
} from '@phosphor-icons/react';
import { t } from '../i18n.js';

const BNET_MSG: Record<string, [string, 'info' | 'warn' | 'bad']> = {
  ok: ['Cuenta de Battle.net conectada.', 'info'],
  cancelado: ['Cancelaste el inicio de sesión en Battle.net: no se conectó nada.', 'warn'],
  estado_invalido: ['La conexión caducó o no empezó en este navegador. Vuelve a pulsar «Conectar con Battle.net».', 'bad'],
  sin_permiso: ['Battle.net no concedió el permiso para ver tus personajes (wow.profile).', 'warn'],
  sin_configurar: ['El servidor no tiene configuradas las credenciales de Blizzard.', 'bad'],
  token: ['Battle.net rechazó el código de acceso. Comprueba que la URL de retorno está registrada en el cliente de Blizzard.', 'bad'],
  usuario: ['No se pudo leer tu cuenta de Battle.net. Inténtalo de nuevo.', 'bad'],
  error: ['Battle.net devolvió un error. Inténtalo de nuevo.', 'bad'],
};

/** Segundos (racional o número) → «45 s», «12 min 5 s», «2 h 10 min». */
export function secondsLabel(v: any): string {
  const q = toQ(v);
  const s = q ? q.toNumber() : typeof v === 'number' ? v : null;
  if (s === null) return t('sin datos');
  const n = Math.ceil(s);
  if (n < 60) return `${n} s`;
  if (n < 3600) return `${Math.floor(n / 60)} min${n % 60 ? ` ${n % 60} s` : ''}`;
  return `${Math.floor(n / 3600)} h${Math.round((n % 3600) / 60) ? ` ${Math.round((n % 3600) / 60)} min` : ''}`;
}
const pct = (v: any) => { const q = toQ(v); return q ? `${Math.round(q.toNumber() * 100)} %` : '—'; };

interface RouteForm { professionId: string; from: string; to: string; mode: 'rapida' | 'barata'; budget: string; chance: 'comunidad' | 'garantizado'; all: boolean; useKnown: boolean; currentMax: string; characterLevel: string }

export function Character() {
  const { ctx, ctxQuery } = useApp();
  const msg = hashQuery().get('bnet');
  const status = useAsync(() => api('/api/battlenet/status'), []);
  const connected = Boolean(status.data?.connected);
  const chars = useAsync(() => (connected ? api('/api/me/characters') : Promise.resolve(null)), [connected]);
  const profs = useAsync(() => api(`/api/leveling/professions?version=${ctx.version}`), [ctx.version]);
  const [charId, setCharIdState] = useState<string>(readChosen);
  const setCharId = (id: string) => { setCharIdState(id); writeChosen(id); };
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [charData, setCharData] = useState<any>(null);
  const [focus, setFocus] = useState<{ pid: number; n: number } | null>(null);
  const autoSynced = React.useRef(new Set<string>());
  const autoListed = React.useRef(false);

  const list: any[] = chars.data?.characters ?? [];
  useEffect(() => { if (list.length && !list.some((c) => c.id === charId)) setCharId(list[0].id); }, [list.length]);
  useEffect(() => { setCharData(list.find((c) => c.id === charId) ?? null); }, [charId, chars.data]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const syncChars = () => run('chars', async () => { await api('/api/me/characters/sync', { method: 'POST', body: {} }); chars.reload(); });
  const syncAll = (id = charId) => run('sync', async () => { const r = await api(`/api/me/characters/${id}/sync`, { method: 'POST', body: {} }); setCharData(r.character); });
  // Recién conectado y sin personajes guardados: se piden a Blizzard sin que haga falta pulsar nada.
  useEffect(() => { if (connected && chars.data && !list.length && !autoListed.current) { autoListed.current = true; syncChars(); } }, [connected, chars.data]);
  // Primera vez que se ve un personaje: se lee su ficha (retrato, equipo y profesiones) automáticamente.
  useEffect(() => {
    if (charData && !charData.profileSyncedAt && !autoSynced.current.has(charData.id) && !busy) { autoSynced.current.add(charData.id); syncAll(charData.id); }
  }, [charData?.id, charData?.profileSyncedAt]);
  const plannable = new Set<number>((profs.data?.professions ?? []).map((p: any) => p.id));
  const disconnect = (deleteData: boolean) => run('out', async () => {
    if (deleteData && !confirm(t('Se borrarán de esta aplicación tus personajes, profesiones, rutas y progreso guardados. No se puede deshacer. ¿Continuar?'))) return;
    await api('/api/battlenet/disconnect', { method: 'POST', body: { deleteData } });
    setCharId(''); status.reload();
  });

  return (
    <>
      <PageHead title={t('Mi personaje')} icon={<IdentificationCard size={26} weight="duotone" aria-hidden="true" />}>{t('Conecta tu cuenta de Battle.net, elige un personaje y una profesión, y te proponemos la ruta más rápida (o la más barata) para subirla con los precios de tu casa de subastas.')}</PageHead>

      {msg && BNET_MSG[msg] && <div className={`alert ${BNET_MSG[msg][1]}`} role="status"><Info size={18} aria-hidden="true" /><p>{t(BNET_MSG[msg][0])}</p></div>}
      {err && <ErrorBox error={err} />}

      <section className="card pc-connect" aria-label={t('Cuenta de Battle.net')}>
        {status.loading && <Loading label={t('Comprobando la conexión…')} />}
        {status.error && <ErrorBox error={status.error} onRetry={status.reload} />}
        {status.data && !status.data.configured && (
          <div className="pc-setup">
            <h2 className="pc-h2">{t('Conexión con Battle.net sin configurar')}</h2>
            <p className="small">{t('Falta')}{' '}{status.data.missing.join(' y ')}{' '}{t('en el servidor. Mientras tanto puedes calcular rutas escribiendo tu nivel a mano (abajo).')}</p>
          </div>
        )}
        {status.data?.configured && !connected && (
          <div className="pc-row">
            <div>
              <h2 className="pc-h2">{t('Conecta tu cuenta')}</h2>
              <p className="small muted">{t('Inicias sesión en la página oficial de Blizzard: aquí nunca se pide tu contraseña. Solo se pide permiso para ver tus personajes de WoW («wow.profile»). Puedes desconectar cuando quieras.')}</p>
            </div>
            <a className="button primary" href={`/api/battlenet/start?region=${ctx.region}`}><SignIn size={18} aria-hidden="true" />{t('Conectar con Battle.net')}</a>
          </div>
        )}
        {connected && (
          <div className="pc-row">
            <div>
              <h2 className="pc-h2"><CheckCircle size={20} weight="fill" className="ok-icon" aria-hidden="true" />{status.data.account.battletag ?? t('Cuenta conectada')}</h2>
              <p className="small muted">{t('Región')}{' '}{String(status.data.account.region).toUpperCase()}{' '}{t('· la conexión caduca')}{' '}{dt(status.data.account.expiresAt)}{t('; después hay que volver a conectar.')}</p>
            </div>
            <div className="pc-actions">
              <button type="button" onClick={syncChars} disabled={!!busy}><ArrowsClockwise size={18} aria-hidden="true" />{busy === 'chars' ? t('Buscando…') : t('Buscar personajes nuevos')}</button>
              <button type="button" onClick={() => disconnect(false)} disabled={!!busy}><SignOut size={18} aria-hidden="true" />{t('Desconectar')}</button>
              <button type="button" className="link danger" onClick={() => disconnect(true)} disabled={!!busy}><Trash size={14} aria-hidden="true" />{t('Desconectar y borrar mis datos')}</button>
            </div>
          </div>
        )}
      </section>

      {connected && (chars.loading || chars.error || list.length !== 1) && (
        <section className="card" aria-label={t('Personajes')}>
          <h2 className="pc-h2">{t('Tus personajes')}</h2>
          {chars.loading && <Loading label={t('Cargando personajes…')} />}
          {chars.error && <ErrorBox error={chars.error} onRetry={chars.reload} />}
          {chars.data && !list.length && (
            <p className="small muted">{t('Aún no hay personajes. Pulsa «Actualizar personajes». Si sigue vacío, Blizzard no devolvió personajes de WoW Forever para esta cuenta (namespace')}{' '}{status.data.namespaces.join(', ')}).</p>
          )}
          {!!list.length && (
            <div className="pc-chars" role="radiogroup" aria-label={t('Elige un personaje')}>
              {list.map((c) => (
                <label key={c.id} className={`pc-char${c.id === charId ? ' on' : ''}`}>
                  <input type="radio" name="pc-char" value={c.id} checked={c.id === charId} onChange={() => setCharId(c.id)} />
                  {c.media?.avatar && <img className="pc-char-avatar" src={c.media.avatar} alt="" width={40} height={40} referrerPolicy="no-referrer" />}
                  <span className="pc-char-name">{c.name}{c.surname ? ` ${c.surname}` : ''}</span>
                  <span className="small muted">{[c.level !== null ? `Nivel ${c.level}` : null, c.raceName, c.className].filter(Boolean).join(' · ')}</span>
                  <span className="small muted">{[c.realm.name ?? c.realm.slug, c.faction === 'HORDE' ? 'Horda' : c.faction === 'ALLIANCE' ? 'Alianza' : c.faction].filter(Boolean).join(' · ')}</span>
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {connected && charData && <CharacterSheet c={charData} busy={busy === 'sync'} onSync={() => syncAll()} />}

      {connected && charData && (
        <ProfessionsCard c={charData} profs={profs.data?.professions ?? []} plannable={plannable} onPlan={(pid) => setFocus({ pid, n: Date.now() })} onChange={setCharData} />
      )}

      <RoutePlanner c={connected ? charData : null} profs={profs.data?.professions ?? []} ctxQuery={ctxQuery} ctx={ctx} focus={focus} />
    </>
  );
}

function sourceBadge(src: string | null) {
  if (src === 'blizzard') return <span className="badge b-ok">{t('Blizzard')}</span>;
  if (src === 'manual') return <span className="badge b-info">{t('Manual')}</span>;
  return <span className="badge b-neutral">{t('Sin dato')}</span>;
}

function ProfessionsCard({ c, profs, plannable, onPlan, onChange }: { c: any; profs: any[]; plannable: Set<number>; onPlan: (pid: number) => void; onChange: (c: any) => void }) {
  const [edit, setEdit] = useState<{ pid: string; skill: string; max: string; note: string; preferred: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!edit) return;
    setErr(null);
    try {
      const r = await api(`/api/me/characters/${c.id}/professions/${edit.pid}`, { method: 'PUT', body: { skillPoints: edit.skill, maxSkillPoints: edit.max, note: edit.note, preferred: edit.preferred } });
      onChange(r.character); setEdit(null);
    } catch (e) { setErr((e as Error).message); }
  };
  const removeManual = async (pid: number) => {
    const r = await api(`/api/me/characters/${c.id}/professions/${pid}`, { method: 'DELETE' });
    onChange(r.character);
  };
  const sync = c.professionSync;
  return (
    <section className="card" aria-label={t('Profesiones de {x}', { x: c.name })}>
      <div className="pc-row">
        <h2 className="pc-h2">{t('Profesiones de')}{' '}{c.name}</h2>
        <div className="pc-actions">
          <button type="button" onClick={() => setEdit({ pid: String(profs[0]?.id ?? ''), skill: '', max: '', note: '', preferred: 'manual' })}><PencilSimple size={18} aria-hidden="true" />{t('Añadir a mano')}</button>
        </div>
      </div>
      {sync && (
        <p className={`small ${sync.status === 'ok' ? 'muted' : 'lv-warn-text'}`}>
          {sync.status === 'ok' ? t('Leído de Blizzard {d}.', { d: dt(sync.checkedAt) }) : (sync.detail ? t(sync.detail) : t('Blizzard respondió {s}.', { s: sync.httpStatus }))}
        </p>
      )}
      {!c.professions.length ? (
        <p className="small muted">{t('Sin profesiones registradas.')}{' '}{sync ? t('Añádelas a mano con tu nivel actual y máximo (lo ves en el juego, ventana de habilidades).') : t('Pulsa «Actualizar desde Blizzard» arriba o añádelas a mano.')}</p>
      ) : (
        <ProfessionTiles c={c} plannable={plannable} onPlan={onPlan} onEdit={(p) => setEdit({ pid: String(p.professionId), skill: String(p.manual?.skillPoints ?? p.effective.skillPoints ?? ''), max: String(p.manual?.maxSkillPoints ?? p.effective.maxSkillPoints ?? ''), note: p.manual?.note ?? '', preferred: p.manual?.preferred ?? 'manual' })} />
      )}
      {c.professions.some((p: any) => p.manual) && (
        <ul className="pc-manual-notes small muted">
          {c.professions.filter((p: any) => p.manual).map((p: any) => (
            <li key={p.professionId}>{PROFESSION_NAME_ES[p.professionId] ?? p.name}{t(': dato manual')}{' '}{p.manual.skillPoints ?? '—'} ({dt(p.manual.updatedAt)}){p.blizzard ? `, Blizzard ${p.blizzard.skillPoints ?? '—'}` : ''}. <button type="button" className="link danger" onClick={() => removeManual(p.professionId)}>{t('Quitar manual')}</button></li>
          ))}
        </ul>
      )}
      {edit && (
        <form className="pc-edit" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="field">{t('Profesión')}<select value={edit.pid} onChange={(e) => setEdit({ ...edit, pid: e.target.value })}>
              {profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">{t('Nivel actual')}<input type="number" min={0} max={1000} value={edit.skill} onChange={(e) => setEdit({ ...edit, skill: e.target.value })} /></label>
          <label className="field">{t('Máximo actual')}<input type="number" min={0} max={1000} value={edit.max} onChange={(e) => setEdit({ ...edit, max: e.target.value })} placeholder={t('p. ej. 150')} /></label>
          <label className="field pc-note">{t('Nota')}<input type="text" maxLength={200} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder={t('p. ej. visto en el juego')} /></label>
          <label className="check"><input type="checkbox" checked={edit.preferred === 'blizzard'} onChange={(e) => setEdit({ ...edit, preferred: e.target.checked ? 'blizzard' : 'manual' })} />{t('Usar el dato de Blizzard cuando exista')}</label>
          <div className="pc-actions">
            <button type="submit" className="primary"><FloppyDisk size={18} aria-hidden="true" />{t('Guardar')}</button>
            <button type="button" onClick={() => setEdit(null)}>{t('Cancelar')}</button>
          </div>
          {err && <p className="small lv-error" role="alert">{err}</p>}
          <p className="small muted pc-full">{t('El dato manual se guarda con fecha y la etiqueta «Manual»; no sustituye al de Blizzard, que se conserva.')}</p>
        </form>
      )}
    </section>
  );
}

function RoutePlanner({ c, profs, ctxQuery, ctx, focus }: { c: any | null; profs: any[]; ctxQuery: string; ctx: any; focus?: { pid: number; n: number } | null }) {
  const charProf = (pid: string) => c?.professions.find((p: any) => String(p.professionId) === pid) ?? null;
  const [f, setF] = useState<RouteForm>({ professionId: '', from: '1', to: '300', mode: 'rapida', budget: '', chance: 'comunidad', all: false, useKnown: true, currentMax: '', characterLevel: '' });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [avoided, setAvoided] = useState<Avoided[]>([]);
  const plans = useAsync(() => (c ? api(`/api/me/plans?character=${c.id}`) : Promise.resolve(null)), [c?.id, saved]);

  // Profesión por defecto: la primera del personaje que tenga datos de subida; si no, la primera de la lista.
  useEffect(() => {
    if (!profs.length) return;
    const own = c?.professions.find((p: any) => profs.some((x) => x.id === p.professionId));
    const pid = String(own?.professionId ?? (f.professionId || profs[0].id));
    const cp = charProf(pid);
    setF((x) => ({ ...x, professionId: pid, from: cp?.effective.skillPoints ? String(cp.effective.skillPoints) : x.from }));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profs.length, c?.id]);

  const [autoRun, setAutoRun] = useState(0);
  const formRef = useScrollTo<HTMLFormElement>(focus?.n);
  useEffect(() => {
    if (!focus) return;
    const p = charProf(String(focus.pid));
    setF((x) => ({ ...x, professionId: String(focus.pid), from: p?.effective.skillPoints ? String(p.effective.skillPoints) : x.from }));
    setAutoRun(focus.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);
  useEffect(() => { if (autoRun) { setAutoRun(0); calc(); } }, [autoRun]);

  const cp = charProf(f.professionId);
  const known = cp?.effective.skillPoints ?? null;
  const body = () => ({
    ...ctx, professionId: Number(f.professionId), to: Number(f.to), mode: f.mode, budget: f.budget.trim() || null, chance: f.chance,
    trainerOnly: !f.all, useKnown: f.useKnown, ...(c && (known === null || String(known) !== f.from) ? { from: f.from } : {}),
    ...(avoided.length ? { exclude: avoided.map((a) => a.id) } : {}),
  });
  const calc = async () => {
    setLoading(true); setErr(null);
    try {
      if (c) setResult(await api(`/api/me/characters/${c.id}/route`, { method: 'POST', body: body() }));
      else {
        const q = new URLSearchParams({ profession: f.professionId, from: f.from, to: f.to, mode: f.mode, chance: f.chance, trainerOnly: f.all ? '0' : '1' });
        if (f.budget.trim()) q.set('budget', f.budget.trim());
        if (f.currentMax) q.set('currentMax', f.currentMax);
        if (f.characterLevel) q.set('characterLevel', f.characterLevel);
        if (avoided.length) q.set('exclude', avoided.map((a) => a.id).join(','));
        setResult(await api(`/api/route?${ctxQuery}&${q}`));
      }
    } catch (e) { setErr((e as Error).message); setResult(null); } finally { setLoading(false); }
  };
  const save = async () => {
    try { const r = await api('/api/me/plans', { method: 'POST', body: { ...body(), characterId: c.id } }); setSaved(r.plan.id); } catch (e) { setErr((e as Error).message); }
  };
  // Al evitar o permitir una receta se recalcula la ruta ya mostrada.
  const firstAvoid = useRef(true);
  useEffect(() => { if (firstAvoid.current) { firstAvoid.current = false; return; } if (result) calc(); }, [avoided]);
  const budgetBad = f.budget.trim() !== '' && !/^\d{1,7}(\.\d{1,4})?$/.test(f.budget.trim());
  const current = profs.find((p) => String(p.id) === f.professionId);

  return (
    <>
      <form ref={formRef} className="card lv-form" onSubmit={(e) => { e.preventDefault(); if (!budgetBad) calc(); }} aria-label={t('Calcular ruta')}>
        <h2 className="pc-h2">{c ? t('Ruta para {x}', { x: c.name }) : t('Ruta con tu nivel escrito a mano')}</h2>
        {!c && <p className="small muted">{t('Sin cuenta conectada: indica tu nivel actual y, si los sabes, tu máximo y el nivel del personaje (para avisarte de los rangos del instructor).')}</p>}
        <div className="pc-fields">
          <label className="field">{t('Profesión')}<select value={f.professionId} onChange={(e) => { const p = charProf(e.target.value); setF({ ...f, professionId: e.target.value, from: p?.effective.skillPoints ? String(p.effective.skillPoints) : f.from }); }}>
              {profs.map((p) => <option key={p.id} value={p.id}>{PROFESSION_NAME_ES[p.id] ?? p.name}{charProf(String(p.id))?.effective.skillPoints != null ? ` (${charProf(String(p.id)).effective.skillPoints})` : ''}</option>)}
            </select>
          </label>
          <label className="field">{t('Nivel actual')}<input type="number" min={1} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            {c && <span className="pc-hint">{known !== null ? <>{t('Observado:')}{' '}{known} {sourceBadge(cp.effective.source)}</> : t('Sin dato: escríbelo')}</span>}
          </label>
          <label className="field">{t('Objetivo')}<input type="number" min={2} max={current?.maxSkill} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </label>
          <label className="field">{t('Presupuesto (oro)')}<input type="text" inputMode="decimal" placeholder={t('sin límite')} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} aria-invalid={budgetBad} />
          </label>
          {!c && <>
            <label className="field">{t('Máximo actual')}<input type="number" min={1} placeholder={t('opcional')} value={f.currentMax} onChange={(e) => setF({ ...f, currentMax: e.target.value })} /></label>
            <label className="field">{t('Nivel del personaje')}<input type="number" min={1} max={60} placeholder={t('opcional')} value={f.characterLevel} onChange={(e) => setF({ ...f, characterLevel: e.target.value })} /></label>
          </>}
        </div>
        <fieldset className="pc-mode">
          <legend className="small muted">{t('Prioridad')}</legend>
          <label className={`pc-mode-opt${f.mode === 'rapida' ? ' on' : ''}`}><input type="radio" name="mode" checked={f.mode === 'rapida'} onChange={() => setF({ ...f, mode: 'rapida' })} /><Lightning size={18} aria-hidden="true" />{t('Más rápida')}</label>
          <label className={`pc-mode-opt${f.mode === 'barata' ? ' on' : ''}`}><input type="radio" name="mode" checked={f.mode === 'barata'} onChange={() => setF({ ...f, mode: 'barata' })} /><PiggyBank size={18} aria-hidden="true" />{t('Más barata')}</label>
        </fieldset>
        <div className="pc-checks">
          <label className="check"><input type="checkbox" checked={f.chance === 'garantizado'} onChange={(e) => setF({ ...f, chance: e.target.checked ? 'garantizado' : 'comunidad' })} />{t('Solo puntos garantizados (naranja)')}</label>
          <label className="check"><input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} />{t('Incluir recetas de patrón, botín o misión')}</label>
          {c && <label className="check"><input type="checkbox" checked={f.useKnown} onChange={(e) => setF({ ...f, useKnown: e.target.checked })} />{t('Usar las recetas que ya conozco (si Blizzard las da)')}</label>}
        </div>
        {budgetBad && <p className="small lv-error" role="alert">{t('Presupuesto en oro, con hasta 4 decimales.')}</p>}
        <div className="pc-actions">
          <button type="submit" className="primary" disabled={loading || budgetBad || !f.professionId}><ListNumbers size={18} aria-hidden="true" />{loading ? t('Calculando…') : t('Calcular ruta')}</button>
          {c && result && <button type="button" onClick={save}><FloppyDisk size={18} aria-hidden="true" />{t('Guardar y seguir progreso')}</button>}
        </div>
      </form>
      {err && <ErrorBox error={err} />}
      {loading && <Loading label={t('Calculando la ruta…')} rows={5} />}
      {result && !loading && <>
        <AvoidedList list={avoided} onRemove={(id) => setAvoided(avoided.filter((a) => a.id !== id))} onClear={() => setAvoided([])} />
        <RouteView d={result} doneKey={`ch:${c?.id ?? 'manual'}`} onAvoid={(id, name) => setAvoided([...avoided.filter((a) => a.id !== id), { id, name }])} />
      </>}
      {c && plans.data && <SavedPlans plans={plans.data.plans} profs={profs} onChanged={() => setSaved(String(Date.now()))} />}
    </>
  );
}

export function RouteView({ d, doneKey, onAvoid }: { d: any; doneKey: string; onAvoid?: (spellId: number, name: string) => void }) {
  const [tab, setTab] = useState<'guia' | 'pasos' | 'compra'>('guia');
  const openStep = (i: number) => { setTab('pasos'); setTimeout(() => document.getElementById(`pc-paso-${i}`)?.scrollIntoView({ block: 'start' }), 50); };
  const steps = useStepsDone(`${doneKey}:${d.profession?.id}:${d.to}:${d.mode}`, doneKey);
  if (d.completed) {
    return <section className="card"><p className="lv-status ok"><CheckCircle size={18} aria-hidden="true" />{d.profession.name}{t(': ya tienes')}{' '}{d.from}{t(', que alcanza el objetivo')}{' '}{d.to}{t('. No hace falta ruta.')}</p></section>;
  }
  const cmp = d.comparison;
  const other = d.mode === 'rapida' ? cmp.barata : cmp.rapida;
  return (
    <>
      <section className="card lv-summary" aria-label={t('Resumen de la ruta')}>
        <div className="lv-summary-main">
          <span className="lv-summary-label">{d.profession.name} · {d.from} → {d.to} · {d.mode === 'rapida' ? t('más rápida') : t('más barata')}{d.startSource ? ` · inicio ${d.startSource}` : ''}</span>
          <span className="lv-total">{d.total ? <Money v={d.total} /> : <span className="lv-total-none">{t('Sin datos')}</span>}</span>
          <span className="lv-summary-label">{t('Costo estimado (materiales + instructor)')}</span>
        </div>
        <dl className="lv-summary-parts">
          <div><dt>{t('Tiempo activo esperado')}</dt><dd>{secondsLabel(d.activeSeconds)}</dd></div>
          <div><dt>{t('Materiales')}</dt><dd><Money v={d.materialsCost} /></dd></div>
          <div><dt>{t('Instructor')}</dt><dd><Money v={d.trainingCost} /></dd></div>
          {d.recovery && (
            <div title={t('Hipotético: vender lo fabricado (campo «{f}», comisión {p} %). No se resta del costo.', { f: d.recovery.priceField, p: Math.round(Number(d.recovery.commission) * 100) })}>
              <dt>{t('Si vendieras lo fabricado')}</dt>
              <dd>{d.recovery.min ? <><Money v={d.recovery.min} />{toQ(d.recovery.max)?.eq(toQ(d.recovery.min)!) ? null : <> – <Money v={d.recovery.max} /></>}{d.recovery.stepsWithoutPrice + d.recovery.stepsBound > 0 ? t(' (parcial)') : ''}</> : t('sin datos')}</dd>
            </div>
          )}
          {d.budget && d.total && <div><dt>{t('Presupuesto')}</dt><dd><Money v={d.budget} /> {d.withinBudget ? <span className="badge b-ok">{t('cabe')}</span> : <span className="badge b-bad">{t('no cabe')}</span>}</dd></div>}
        </dl>
        <div className="lv-status pc-compare">
          <span><strong>{t('Comparación:')}</strong>{' '}{t('la')}{' '}{d.mode === 'rapida' ? t('más barata') : t('más rápida')}{' '}{t('cuesta')}{' '}<Money v={other.total} />{' '}{t('y lleva')}{' '}{secondsLabel(other.activeSeconds)}{' '}{t('de fabricación')}{other.incomplete ? t(' (con tramos sin datos)') : ''}.</span>
        </div>
        <PatternNote levels={d.patternLevels ?? 0} trainerOnly={d.trainerOnly} />
      </section>

      {(d.blockers.length > 0 || d.requirements.length > 0) && (
        <section className="card pc-blockers" aria-label={t('Bloqueos y requisitos')}>
          {d.blockers.map((b: string, i: number) => <p key={i} className="lv-gap-title"><Warning size={18} weight="bold" aria-hidden="true" />{b}</p>)}
          {d.requirements.map((r: any) => (
            <p key={r.rank} className="small">
              <Flag size={16} aria-hidden="true" /> <strong>{r.rank}</strong>{t(': apréndelo en el instructor antes de pasar de')}{' '}{r.before}{' '}{t('(nivel de personaje')}{' '}{r.characterLevel}).{' '}
              {r.satisfied === true ? <span className="badge b-ok">{t('ya lo tienes')}</span> : r.satisfied === false ? <span className="badge b-warn">{t('pendiente')}</span> : <span className="badge b-neutral">{t('sin confirmar')}</span>}{' '}
              {r.levelOk === false && <span className="badge b-bad">{t('nivel insuficiente')}</span>}
              <span className="lv-unit">{t('Según las reglas de Classic; no verificado en Forever. Costo del rango: sin datos.')}</span>
            </p>
          ))}
        </section>
      )}

      <RouteProgress steps={d.steps} done={steps.done} onReset={steps.reset} />
      <div className="lv-tabs" role="tablist" aria-label={t('Vista')}>
        <button type="button" role="tab" aria-selected={tab === 'guia'} onClick={() => setTab('guia')}><Table size={18} aria-hidden="true" />{t('Resumen')}</button>
        <button type="button" role="tab" aria-selected={tab === 'pasos'} onClick={() => setTab('pasos')}><ListNumbers size={18} aria-hidden="true" />{t('Pasos')}<span className="hide-sm">{' '}{t('en detalle')}</span> <span className="lv-count">{d.steps.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'compra'} onClick={() => setTab('compra')}><ShoppingCart size={18} aria-hidden="true" /><span className="hide-sm">{t('Lista de compra')}</span><span className="show-sm">{t('Compra')}</span> <span className="lv-count">{d.shopping.length}</span></button>
      </div>
      {tab === 'guia' ? <RouteGuide steps={d.steps} done={steps.done} onOpen={openStep} /> : tab === 'pasos' ? (
        <ol className="lv-steps">
          {d.steps.map((s: any, i: number) => (
            <li key={i} id={`pc-paso-${i}`} className={`lv-step${s.recipe ? '' : ' gap'}${steps.done.has(stepKey(s)) ? ' done' : ''}`}>
              <div className="lv-level"><span className="lv-step-n">{t('Paso')}{' '}{i + 1}</span><span className="mono">{s.from} → {s.to}</span>{s.recipe && i < d.steps.length - 1 && <span className="lv-unit">{t('Cambia al llegar a')}{' '}{s.to}</span>}
                <StepCheck s={s} i={i} done={steps.done.has(stepKey(s))} onToggle={() => steps.toggle(stepKey(s), s)} /></div>
              {s.recipe ? (
                <>
                  <div className="lv-main">
                    <div className="lv-title">
                      <span className="lv-qty mono">{String(s.crafts)} ×</span>
                      <ItemLabel id={s.recipe.createsItemId} quality={s.recipe.createsQuality} px={32} href={s.recipe.catalogRecipeId ? `#/receta/${s.recipe.catalogRecipeId}` : undefined} name={s.recipe.name ?? s.recipe.nameEn} />
                      {s.known && <span className="badge b-ok">{t('ya la conoces')}</span>}
                    </div>
                    <p className="small pc-crafts">
                      {s.certain
                        ? <>{t('Exacto:')}{' '}{String(s.crafts)}{' '}{t('fabricaciones (todo naranja, cada una da')}{' '}{s.recipe.skillUps}{' '}{t('punto')}{s.recipe.skillUps > 1 ? 's' : ''}).</>
                        : <>{t('Esperadas')}{' '}{toQ(s.expectedCrafts)?.toDecimal(1)}{' '}{t('(se compra para')}{' '}{String(s.crafts)}{t('); garantizado: mínimo')}{' '}{String(s.guaranteedCrafts)}{t('. Probabilidad estimada hasta')}{' '}{pct(s.minChance)}{t(': puede hacer falta más.')}</>}
                    </p>
                    <ul className="lv-mats" aria-label={t('Materiales')}>
                      {s.materials.map((m: any) => (
                        <MatChip key={m.itemId} m={m} />
                      ))}
                    </ul>
                    <p className="lv-meta">
                      <HowToLearn r={s.recipe} />
                      <span aria-hidden="true">·</span>
                      <span>{t('Dificultad')}{' '}<SkillColor c={s.colorFrom} />{s.colorTo !== s.colorFrom && <> a <SkillColor c={s.colorTo} /></>}</span>
                      <span aria-hidden="true">·</span>
                      <span className="icon-inline"><Timer size={12} aria-hidden="true" />{s.recipe.castSeconds !== null ? `${s.recipe.castSeconds} s c/u · ${secondsLabel(s.activeSeconds)}` : t('tiempo sin datos')}</span>
                      {!!s.recipe.tools.length && <><span aria-hidden="true">·</span><span>{t('Herramienta:')}{' '}{s.recipe.tools.join(', ')}</span></>}
                      <span aria-hidden="true">·</span>
                      <a href={s.recipe.wowheadUrl} target="_blank" rel="noreferrer" className="icon-inline">{t('Wowhead')}<ArrowSquareOut size={12} aria-hidden="true" /></a>
                    </p>
                    <StepAlternatives s={s} onAvoid={onAvoid} />
                  </div>
                  <div className="lv-cost"><Money v={s.cost} /></div>
                </>
              ) : (
                <div className="lv-main">
                  <p className="lv-gap-title"><Warning size={18} weight="bold" aria-hidden="true" />{t('Sin ruta para estos niveles')}</p>
                  <p className="small lv-gap-reason">{s.reason}</p>
                  {!!s.missingItems.length && <p className="small muted">{t('Materiales sin precio:')}{' '}{s.missingItems.slice(0, 8).map((m: any) => m.name ?? t('Objeto {id}', { id: m.itemId })).join(', ')}{s.missingItems.length > 8 ? '…' : ''}{t('. Puedes indicar precios manuales en «Subir nivel».')}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <ShoppingPanel d={d} done={steps.done} bagKey={doneKey} />
      )}
      <details className="card lv-details">
        <summary className="icon-inline"><Info size={16} aria-hidden="true" />{t('¿Cómo se calcula?')}</summary>
        <ul className="small lv-notes">
          <li>{d.mode === 'rapida'
            ? <>{t('Más rápida: en cada nivel, la receta con menor tiempo de fabricación esperado (tiempo de lanzamiento de Wowhead ÷ probabilidad).')}{d.budget ? <>{' '}{t('Con presupuesto se buscan combinaciones que caben (')}{d.evaluated}{' '}{t('evaluadas): es la más rápida')}{' '}<strong>{t('entre las evaluadas')}</strong>{t(', no un óptimo garantizado.')}</> : null}</>
            : <>{t('Más barata: en cada nivel, la receta que sube un punto más barato.')}</>}</li>
          <li>{t('El tiempo activo solo cuenta las fabricaciones. No incluye')}{' '}{d.notIncluded.map((x: string) => t(x)).join(', ')}{t(': no hay datos verificados para estimarlo. Las recetas con reutilización no se usan, así que no hay esperas.')}</li>
          {d.recovery && <li>{t('«Si vendieras lo fabricado» es hipotético: no se resta del costo ni decide la ruta (vender depende de la demanda).')}{' '}{d.recovery.stepsBound ? `${t('{n} paso(s) crean objetos ligados (no se venden en la casa de subastas).', { n: d.recovery.stepsBound })} ` : ''}{d.recovery.stepsWithoutPrice ? t('{n} paso(s) sin precio de venta.', { n: d.recovery.stepsWithoutPrice }) : ''}</li>}
          <li>{t('Probabilidad en amarillo y verde:')}{' '}{d.chanceModel === 'garantizado' ? t('no se usa (solo naranja).') : t('estimación de la comunidad (Blizzard no la publica).')}</li>
          <li>{t('Precios: campo «')}{d.priceField}{t('», escaneo')}{' '}{d.priceSourceTime ? `${t('hace {a}', { a: age(hoursSince(d.priceSourceTime)) })} (${dt(d.priceSourceTime)})` : t('sin datos')}{t('. Recetas:')}{' '}<a href={d.source.url} target="_blank" rel="noreferrer">{t('Wowhead')}</a> ({dt(d.source.fetchedAt)}{t('); tiempos de lanzamiento comprobados el')}{' '}{d.source.castTimes.checkedAt}.{d.source.vendor?.items ? ` ${t('Los materiales que solo venden los vendedores ({n}, Wowhead, {d}) usan el precio del vendedor si es más barato; sin descuentos por reputación.', { n: d.source.vendor.items, d: d.source.vendor.checkedAt })}` : ''}</li>
          {d.knownRecipes > 0 && <li>{d.knownRecipes}{' '}{t('receta(s) conocida(s) según Blizzard, sin costo de instructor')}{d.unmatchedKnownRecipes ? `; ${t('{n} no se pudieron enlazar con Wowhead', { n: d.unmatchedKnownRecipes })}` : ''}.</li>}
          <li>{t('Algoritmo:')}{' '}{t(d.algorithm)}.</li>
        </ul>
      </details>
    </>
  );
}

function SavedPlans({ plans, profs, onChanged }: { plans: any[]; profs: any[]; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const detail = useAsync(() => (open ? api(`/api/me/plans/${open}`) : Promise.resolve(null)), [open]);
  const [obs, setObs] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pname = (id: number) => profs.find((p) => p.id === id)?.name ?? t('Profesión {id}', { id });
  if (!plans.length) return null;
  const progress = async (payload: any) => {
    setBusy(true); setErr(null);
    try { await api(`/api/me/plans/${open}/progress`, { method: 'POST', body: payload }); setObs(''); detail.reload(); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm(t('¿Borrar esta ruta guardada y su progreso?'))) return;
    await api(`/api/me/plans/${id}`, { method: 'DELETE' }); if (open === id) setOpen(null); onChanged();
  };
  const p = detail.data?.plan;
  return (
    <section className="card" aria-label={t('Rutas guardadas')}>
      <h2 className="pc-h2">{t('Rutas guardadas')}</h2>
      <ul className="pc-plans">
        {plans.map((x) => (
          <li key={x.id} className={x.id === open ? 'on' : ''}>
            <button type="button" className="link" onClick={() => setOpen(x.id === open ? null : x.id)} aria-expanded={x.id === open}>
              {pname(x.professionId)} · {x.startSkill} → {x.target} · {x.mode === 'rapida' ? t('rápida') : t('barata')}
            </button>
            <span className={`badge ${x.status === 'completado' ? 'b-ok' : 'b-info'}`}>{x.status}</span>
            <span className="small muted">{t('actualizada')}{' '}{dt(x.updatedAt)}</span>
            <button type="button" className="link danger" onClick={() => remove(x.id)} aria-label={t('Borrar ruta')}><XCircle size={16} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      {open && detail.loading && <Loading label={t('Cargando ruta…')} />}
      {p && (
        <div className="pc-progress">
          <form className="row" onSubmit={(e) => { e.preventDefault(); progress({ observedSkill: Number(obs) }); }}>
            <label className="field">{t('Nivel que tienes ahora')}<input type="number" min={1} value={obs} onChange={(e) => setObs(e.target.value)} required /></label>
            <button type="submit" className="primary" disabled={busy}>{t('Registrar y recalcular')}</button>
            <button type="button" onClick={() => progress({ sync: true })} disabled={busy}><ArrowsClockwise size={18} aria-hidden="true" />{t('Leer de Blizzard')}</button>
          </form>
          {err && <p className="small lv-error" role="alert">{err}</p>}
          {!!p.progress.length && (
            <ol className="small pc-history">
              {p.progress.map((e: any, i: number) => <li key={i}>{dt(e.at)}{t(': nivel')}{' '}{e.observedSkill} ({e.source === 'blizzard' ? t('Blizzard') : t('manual')}){e.note ? ` · ${e.note}` : ''}</li>)}
            </ol>
          )}
          {p.status === 'completado' ? <p className="lv-status ok"><CheckCircle size={18} aria-hidden="true" />{t('Objetivo alcanzado.')}</p> : p.result && <RouteView d={p.result} doneKey={`plan:${p.id}`} />}
        </div>
      )}
    </section>
  );
}
