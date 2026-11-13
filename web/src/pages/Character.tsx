/**
 * «Mi personaje» (PC-13): conectar Battle.net, elegir un personaje propio, ver sus profesiones (oficial o manual, con
 * procedencia), calcular la ruta más rápida o más barata, guardarla y registrar el progreso.
 * Sin conexión (o sin credenciales en el servidor) funciona en modo manual: el nivel se escribe a mano.
 */
import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, PageHead, Money, toQ, age, hoursSince, dt, hashQuery } from '../lib.js';
import { ItemLabel } from '../icons.js';
import { SkillColor, HowToLearn } from './Leveling.js';
import {
  IdentificationCard, SignIn, SignOut, ArrowsClockwise, Warning, CheckCircle, Info, Lightning, PiggyBank, Timer, ListNumbers,
  ShoppingCart, FloppyDisk, ArrowSquareOut, Trash, PencilSimple, XCircle, Flag,
} from '@phosphor-icons/react';

const BNET_MSG: Record<string, [string, 'info' | 'warn' | 'bad']> = {
  ok: ['Cuenta de Battle.net conectada. Pulsa «Actualizar personajes» si no aparecen.', 'info'],
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
  if (s === null) return 'sin datos';
  const t = Math.ceil(s);
  if (t < 60) return `${t} s`;
  if (t < 3600) return `${Math.floor(t / 60)} min${t % 60 ? ` ${t % 60} s` : ''}`;
  return `${Math.floor(t / 3600)} h${Math.round((t % 3600) / 60) ? ` ${Math.round((t % 3600) / 60)} min` : ''}`;
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
  const [charId, setCharId] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [charData, setCharData] = useState<any>(null);

  const list: any[] = chars.data?.characters ?? [];
  useEffect(() => { if (!charId && list.length) setCharId(list[0].id); }, [list.length]);
  useEffect(() => { setCharData(list.find((c) => c.id === charId) ?? null); }, [charId, chars.data]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const syncChars = () => run('chars', async () => { await api('/api/me/characters/sync', { method: 'POST', body: {} }); chars.reload(); });
  const syncProfs = () => run('profs', async () => { const r = await api(`/api/me/characters/${charId}/professions/sync`, { method: 'POST', body: {} }); setCharData(r.character); });
  const disconnect = (deleteData: boolean) => run('out', async () => {
    if (deleteData && !confirm('Se borrarán de esta aplicación tus personajes, profesiones, rutas y progreso guardados. No se puede deshacer. ¿Continuar?')) return;
    await api('/api/battlenet/disconnect', { method: 'POST', body: { deleteData } });
    setCharId(''); status.reload();
  });

  return (
    <>
      <PageHead title="Mi personaje" icon={<IdentificationCard size={26} weight="duotone" aria-hidden="true" />}>
        Conecta tu cuenta de Battle.net, elige un personaje y una profesión, y te proponemos la ruta más rápida (o la más barata) para subirla con los precios de tu casa de subastas.
      </PageHead>

      {msg && BNET_MSG[msg] && <div className={`alert ${BNET_MSG[msg][1]}`} role="status"><Info size={18} aria-hidden="true" /><p>{BNET_MSG[msg][0]}</p></div>}
      {err && <ErrorBox error={err} />}

      <section className="card pc-connect" aria-label="Cuenta de Battle.net">
        {status.loading && <Loading label="Comprobando la conexión…" />}
        {status.error && <ErrorBox error={status.error} onRetry={status.reload} />}
        {status.data && !status.data.configured && (
          <div className="pc-setup">
            <h2 className="pc-h2">Conexión con Battle.net sin configurar</h2>
            <p className="small">Falta {status.data.missing.join(' y ')} en el servidor. Mientras tanto puedes calcular rutas escribiendo tu nivel a mano (abajo).</p>
          </div>
        )}
        {status.data?.configured && !connected && (
          <div className="pc-row">
            <div>
              <h2 className="pc-h2">Conecta tu cuenta</h2>
              <p className="small muted">Inicias sesión en la página oficial de Blizzard: aquí nunca se pide tu contraseña. Solo se pide permiso para ver tus personajes de WoW («wow.profile»). Puedes desconectar cuando quieras.</p>
            </div>
            <a className="button primary" href={`/api/battlenet/start?region=${ctx.region}`}><SignIn size={18} aria-hidden="true" />Conectar con Battle.net</a>
          </div>
        )}
        {connected && (
          <div className="pc-row">
            <div>
              <h2 className="pc-h2"><CheckCircle size={20} weight="fill" className="ok-icon" aria-hidden="true" />{status.data.account.battletag ?? 'Cuenta conectada'}</h2>
              <p className="small muted">Región {String(status.data.account.region).toUpperCase()} · la conexión caduca {dt(status.data.account.expiresAt)}; después hay que volver a conectar.</p>
            </div>
            <div className="pc-actions">
              <button type="button" onClick={syncChars} disabled={!!busy}><ArrowsClockwise size={18} aria-hidden="true" />{busy === 'chars' ? 'Actualizando…' : 'Actualizar personajes'}</button>
              <button type="button" onClick={() => disconnect(false)} disabled={!!busy}><SignOut size={18} aria-hidden="true" />Desconectar</button>
              <button type="button" className="link danger" onClick={() => disconnect(true)} disabled={!!busy}><Trash size={14} aria-hidden="true" />Desconectar y borrar mis datos</button>
            </div>
          </div>
        )}
      </section>

      {connected && (
        <section className="card" aria-label="Personajes">
          <h2 className="pc-h2">Tus personajes</h2>
          {chars.loading && <Loading label="Cargando personajes…" />}
          {chars.error && <ErrorBox error={chars.error} onRetry={chars.reload} />}
          {chars.data && !list.length && (
            <p className="small muted">Aún no hay personajes. Pulsa «Actualizar personajes». Si sigue vacío, Blizzard no devolvió personajes de WoW Forever para esta cuenta (namespace {status.data.namespaces.join(', ')}).</p>
          )}
          {!!list.length && (
            <div className="pc-chars" role="radiogroup" aria-label="Elige un personaje">
              {list.map((c) => (
                <label key={c.id} className={`pc-char${c.id === charId ? ' on' : ''}`}>
                  <input type="radio" name="pc-char" value={c.id} checked={c.id === charId} onChange={() => setCharId(c.id)} />
                  <span className="pc-char-name">{c.name}</span>
                  <span className="small muted">{[c.level !== null ? `Nivel ${c.level}` : null, c.raceName, c.className].filter(Boolean).join(' · ')}</span>
                  <span className="small muted">{c.realm.name ?? c.realm.slug}{c.faction ? ` · ${c.faction === 'HORDE' ? 'Horda' : c.faction === 'ALLIANCE' ? 'Alianza' : c.faction}` : ''}</span>
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {connected && charData && (
        <ProfessionsCard c={charData} profs={profs.data?.professions ?? []} onSync={syncProfs} syncing={busy === 'profs'} onChange={setCharData} />
      )}

      <RoutePlanner c={connected ? charData : null} profs={profs.data?.professions ?? []} ctxQuery={ctxQuery} ctx={ctx} />
    </>
  );
}

function sourceBadge(src: string | null) {
  if (src === 'blizzard') return <span className="badge b-ok">Blizzard</span>;
  if (src === 'manual') return <span className="badge b-info">Manual</span>;
  return <span className="badge b-neutral">Sin dato</span>;
}

function ProfessionsCard({ c, profs, onSync, syncing, onChange }: { c: any; profs: any[]; onSync: () => void; syncing: boolean; onChange: (c: any) => void }) {
  const [edit, setEdit] = useState<{ pid: string; skill: string; max: string; note: string; preferred: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nameOf = (pid: number, fallback: string | null) => profs.find((p) => p.id === pid)?.name ?? fallback ?? `Profesión ${pid}`;
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
    <section className="card" aria-label={`Profesiones de ${c.name}`}>
      <div className="pc-row">
        <h2 className="pc-h2">Profesiones de {c.name}</h2>
        <div className="pc-actions">
          <button type="button" onClick={onSync} disabled={syncing}><ArrowsClockwise size={18} aria-hidden="true" />{syncing ? 'Consultando…' : 'Leer de Blizzard'}</button>
          <button type="button" onClick={() => setEdit({ pid: String(profs[0]?.id ?? ''), skill: '', max: '', note: '', preferred: 'manual' })}><PencilSimple size={18} aria-hidden="true" />Indicar a mano</button>
        </div>
      </div>
      {sync && (
        <p className={`small ${sync.status === 'ok' ? 'muted' : 'lv-warn-text'}`}>
          {sync.status === 'ok' ? `Leído de Blizzard ${dt(sync.checkedAt)}.` : sync.detail ?? `Blizzard respondió ${sync.httpStatus}.`}
        </p>
      )}
      {!c.professions.length ? (
        <p className="small muted">Sin profesiones registradas. {sync ? 'Indícalas a mano con tu nivel actual y máximo (lo ves en el juego, ventana de habilidades).' : 'Pulsa «Leer de Blizzard» o indícalas a mano.'}</p>
      ) : (
        <table className="pc-table">
          <thead><tr><th>Profesión</th><th className="num">Nivel</th><th className="num">Máximo</th><th>Origen</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {c.professions.map((p: any) => (
              <tr key={p.professionId}>
                <td>{nameOf(p.professionId, p.name)}{p.manual?.note && <span className="lv-unit">{p.manual.note}</span>}</td>
                <td className="num">{p.effective.skillPoints ?? '—'}</td>
                <td className="num">{p.effective.maxSkillPoints ?? '—'}</td>
                <td>
                  {sourceBadge(p.effective.source)}
                  {p.blizzard && p.manual && <span className="lv-unit">Blizzard: {p.blizzard.skillPoints ?? '—'} · manual: {p.manual.skillPoints ?? '—'} ({dt(p.manual.updatedAt)})</span>}
                </td>
                <td className="pc-row-actions">
                  <button type="button" className="link" onClick={() => setEdit({ pid: String(p.professionId), skill: String(p.manual?.skillPoints ?? p.effective.skillPoints ?? ''), max: String(p.manual?.maxSkillPoints ?? p.effective.maxSkillPoints ?? ''), note: p.manual?.note ?? '', preferred: p.manual?.preferred ?? 'manual' })}>Editar</button>
                  {p.manual && <button type="button" className="link danger" onClick={() => removeManual(p.professionId)}>Quitar manual</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && (
        <form className="pc-edit" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="field">Profesión
            <select value={edit.pid} onChange={(e) => setEdit({ ...edit, pid: e.target.value })}>
              {profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">Nivel actual<input type="number" min={0} max={1000} value={edit.skill} onChange={(e) => setEdit({ ...edit, skill: e.target.value })} /></label>
          <label className="field">Máximo actual<input type="number" min={0} max={1000} value={edit.max} onChange={(e) => setEdit({ ...edit, max: e.target.value })} placeholder="p. ej. 150" /></label>
          <label className="field pc-note">Nota<input type="text" maxLength={200} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="p. ej. visto en el juego" /></label>
          <label className="check"><input type="checkbox" checked={edit.preferred === 'blizzard'} onChange={(e) => setEdit({ ...edit, preferred: e.target.checked ? 'blizzard' : 'manual' })} />Usar el dato de Blizzard cuando exista</label>
          <div className="pc-actions">
            <button type="submit" className="primary"><FloppyDisk size={18} aria-hidden="true" />Guardar</button>
            <button type="button" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
          {err && <p className="small lv-error" role="alert">{err}</p>}
          <p className="small muted pc-full">El dato manual se guarda con fecha y la etiqueta «Manual»; no sustituye al de Blizzard, que se conserva.</p>
        </form>
      )}
    </section>
  );
}

function RoutePlanner({ c, profs, ctxQuery, ctx }: { c: any | null; profs: any[]; ctxQuery: string; ctx: any }) {
  const charProf = (pid: string) => c?.professions.find((p: any) => String(p.professionId) === pid) ?? null;
  const [f, setF] = useState<RouteForm>({ professionId: '', from: '1', to: '300', mode: 'rapida', budget: '', chance: 'comunidad', all: false, useKnown: true, currentMax: '', characterLevel: '' });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
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

  const cp = charProf(f.professionId);
  const known = cp?.effective.skillPoints ?? null;
  const body = () => ({
    ...ctx, professionId: Number(f.professionId), to: Number(f.to), mode: f.mode, budget: f.budget.trim() || null, chance: f.chance,
    trainerOnly: !f.all, useKnown: f.useKnown, ...(c && (known === null || String(known) !== f.from) ? { from: f.from } : {}),
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
        setResult(await api(`/api/route?${ctxQuery}&${q}`));
      }
    } catch (e) { setErr((e as Error).message); setResult(null); } finally { setLoading(false); }
  };
  const save = async () => {
    try { const r = await api('/api/me/plans', { method: 'POST', body: { ...body(), characterId: c.id } }); setSaved(r.plan.id); } catch (e) { setErr((e as Error).message); }
  };
  const budgetBad = f.budget.trim() !== '' && !/^\d{1,7}(\.\d{1,4})?$/.test(f.budget.trim());
  const current = profs.find((p) => String(p.id) === f.professionId);

  return (
    <>
      <form className="card lv-form" onSubmit={(e) => { e.preventDefault(); if (!budgetBad) calc(); }} aria-label="Calcular ruta">
        <h2 className="pc-h2">{c ? `Ruta para ${c.name}` : 'Ruta con tu nivel escrito a mano'}</h2>
        {!c && <p className="small muted">Sin cuenta conectada: indica tu nivel actual y, si los sabes, tu máximo y el nivel del personaje (para avisarte de los rangos del instructor).</p>}
        <div className="pc-fields">
          <label className="field">Profesión
            <select value={f.professionId} onChange={(e) => { const p = charProf(e.target.value); setF({ ...f, professionId: e.target.value, from: p?.effective.skillPoints ? String(p.effective.skillPoints) : f.from }); }}>
              {profs.map((p) => <option key={p.id} value={p.id}>{p.name}{charProf(String(p.id))?.effective.skillPoints != null ? ` (${charProf(String(p.id)).effective.skillPoints})` : ''}</option>)}
            </select>
          </label>
          <label className="field">Nivel actual
            <input type="number" min={1} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            {c && <span className="pc-hint">{known !== null ? <>Observado: {known} {sourceBadge(cp.effective.source)}</> : 'Sin dato: escríbelo'}</span>}
          </label>
          <label className="field">Objetivo
            <input type="number" min={2} max={current?.maxSkill} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </label>
          <label className="field">Presupuesto (oro)
            <input type="text" inputMode="decimal" placeholder="sin límite" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} aria-invalid={budgetBad} />
          </label>
          {!c && <>
            <label className="field">Máximo actual<input type="number" min={1} placeholder="opcional" value={f.currentMax} onChange={(e) => setF({ ...f, currentMax: e.target.value })} /></label>
            <label className="field">Nivel del personaje<input type="number" min={1} max={60} placeholder="opcional" value={f.characterLevel} onChange={(e) => setF({ ...f, characterLevel: e.target.value })} /></label>
          </>}
        </div>
        <fieldset className="pc-mode">
          <legend className="small muted">Prioridad</legend>
          <label className={`pc-mode-opt${f.mode === 'rapida' ? ' on' : ''}`}><input type="radio" name="mode" checked={f.mode === 'rapida'} onChange={() => setF({ ...f, mode: 'rapida' })} /><Lightning size={18} aria-hidden="true" />Más rápida</label>
          <label className={`pc-mode-opt${f.mode === 'barata' ? ' on' : ''}`}><input type="radio" name="mode" checked={f.mode === 'barata'} onChange={() => setF({ ...f, mode: 'barata' })} /><PiggyBank size={18} aria-hidden="true" />Más barata</label>
        </fieldset>
        <div className="pc-checks">
          <label className="check"><input type="checkbox" checked={f.chance === 'garantizado'} onChange={(e) => setF({ ...f, chance: e.target.checked ? 'garantizado' : 'comunidad' })} />Solo puntos garantizados (naranja)</label>
          <label className="check"><input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} />Incluir recetas de patrón, botín o misión</label>
          {c && <label className="check"><input type="checkbox" checked={f.useKnown} onChange={(e) => setF({ ...f, useKnown: e.target.checked })} />Usar las recetas que ya conozco (si Blizzard las da)</label>}
        </div>
        {budgetBad && <p className="small lv-error" role="alert">Presupuesto en oro, con hasta 4 decimales.</p>}
        <div className="pc-actions">
          <button type="submit" className="primary" disabled={loading || budgetBad || !f.professionId}><ListNumbers size={18} aria-hidden="true" />{loading ? 'Calculando…' : 'Calcular ruta'}</button>
          {c && result && <button type="button" onClick={save}><FloppyDisk size={18} aria-hidden="true" />Guardar y seguir progreso</button>}
        </div>
      </form>
      {err && <ErrorBox error={err} />}
      {loading && <Loading label="Calculando la ruta…" rows={5} />}
      {result && !loading && <RouteView d={result} />}
      {c && plans.data && <SavedPlans plans={plans.data.plans} profs={profs} onChanged={() => setSaved(String(Date.now()))} />}
    </>
  );
}

export function RouteView({ d }: { d: any }) {
  const [tab, setTab] = useState<'pasos' | 'compra'>('pasos');
  if (d.completed) {
    return <section className="card"><p className="lv-status ok"><CheckCircle size={18} aria-hidden="true" />{d.profession.name}: ya tienes {d.from}, que alcanza el objetivo {d.to}. No hace falta ruta.</p></section>;
  }
  const cmp = d.comparison;
  const other = d.mode === 'rapida' ? cmp.barata : cmp.rapida;
  return (
    <>
      <section className="card lv-summary" aria-label="Resumen de la ruta">
        <div className="lv-summary-main">
          <span className="lv-summary-label">{d.profession.name} · {d.from} → {d.to} · {d.mode === 'rapida' ? 'más rápida' : 'más barata'}{d.startSource ? ` · inicio ${d.startSource}` : ''}</span>
          <span className="lv-total"><Money v={d.total} /></span>
          <span className="lv-summary-label">Costo estimado (materiales + instructor)</span>
        </div>
        <dl className="lv-summary-parts">
          <div><dt>Tiempo activo esperado</dt><dd>{secondsLabel(d.activeSeconds)}</dd></div>
          <div><dt>Materiales</dt><dd><Money v={d.materialsCost} /></dd></div>
          <div><dt>Instructor</dt><dd><Money v={d.trainingCost} /></dd></div>
          {d.recovery && (
            <div title={`Hipotético: vender lo fabricado (campo «${d.recovery.priceField}», comisión ${Math.round(Number(d.recovery.commission) * 100)} %). No se resta del costo.`}>
              <dt>Si vendieras lo fabricado</dt>
              <dd>{d.recovery.min ? <><Money v={d.recovery.min} />{toQ(d.recovery.max)?.eq(toQ(d.recovery.min)!) ? null : <> – <Money v={d.recovery.max} /></>}{d.recovery.stepsWithoutPrice + d.recovery.stepsBound > 0 ? ' (parcial)' : ''}</> : 'sin datos'}</dd>
            </div>
          )}
          {d.budget && <div><dt>Presupuesto</dt><dd><Money v={d.budget} /> {d.withinBudget ? <span className="badge b-ok">cabe</span> : <span className="badge b-bad">no cabe</span>}</dd></div>}
        </dl>
        <div className="lv-status pc-compare">
          <span><strong>Comparación:</strong> la {d.mode === 'rapida' ? 'más barata' : 'más rápida'} cuesta <Money v={other.total} /> y lleva {secondsLabel(other.activeSeconds)} de fabricación{other.incomplete ? ' (con tramos sin datos)' : ''}.</span>
        </div>
      </section>

      {(d.blockers.length > 0 || d.requirements.length > 0) && (
        <section className="card pc-blockers" aria-label="Bloqueos y requisitos">
          {d.blockers.map((b: string, i: number) => <p key={i} className="lv-gap-title"><Warning size={18} weight="bold" aria-hidden="true" />{b}</p>)}
          {d.requirements.map((r: any) => (
            <p key={r.rank} className="small">
              <Flag size={16} aria-hidden="true" /> <strong>{r.rank}</strong>: apréndelo en el instructor antes de pasar de {r.before} (nivel de personaje {r.characterLevel}).{' '}
              {r.satisfied === true ? <span className="badge b-ok">ya lo tienes</span> : r.satisfied === false ? <span className="badge b-warn">pendiente</span> : <span className="badge b-neutral">sin confirmar</span>}{' '}
              {r.levelOk === false && <span className="badge b-bad">nivel insuficiente</span>}
              <span className="lv-unit">Según las reglas de Classic; no verificado en Forever. Costo del rango: sin datos.</span>
            </p>
          ))}
        </section>
      )}

      <div className="lv-tabs" role="tablist" aria-label="Vista">
        <button type="button" role="tab" aria-selected={tab === 'pasos'} onClick={() => setTab('pasos')}><ListNumbers size={18} aria-hidden="true" />Pasos <span className="lv-count">{d.steps.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'compra'} onClick={() => setTab('compra')}><ShoppingCart size={18} aria-hidden="true" />Lista de compra <span className="lv-count">{d.shopping.length}</span></button>
      </div>
      {tab === 'pasos' ? (
        <ol className="lv-steps">
          {d.steps.map((s: any, i: number) => (
            <li key={i} className={`lv-step${s.recipe ? '' : ' gap'}`}>
              <div className="lv-level"><span className="lv-step-n">Paso {i + 1}</span><span className="mono">{s.from} → {s.to}</span>{s.recipe && i < d.steps.length - 1 && <span className="lv-unit">Cambia al llegar a {s.to}</span>}</div>
              {s.recipe ? (
                <>
                  <div className="lv-main">
                    <div className="lv-title">
                      <span className="lv-qty mono">{String(s.crafts)} ×</span>
                      <ItemLabel id={s.recipe.createsItemId} quality={s.recipe.createsQuality} px={32} href={s.recipe.catalogRecipeId ? `#/receta/${s.recipe.catalogRecipeId}` : undefined} name={s.recipe.name ?? s.recipe.nameEn} />
                      {s.known && <span className="badge b-ok">ya la conoces</span>}
                    </div>
                    <p className="small pc-crafts">
                      {s.certain
                        ? <>Exacto: {String(s.crafts)} fabricaciones (todo naranja, cada una da {s.recipe.skillUps} punto{s.recipe.skillUps > 1 ? 's' : ''}).</>
                        : <>Esperadas {toQ(s.expectedCrafts)?.toDecimal(1)} (se compra para {String(s.crafts)}); garantizado: mínimo {String(s.guaranteedCrafts)}. Probabilidad estimada hasta {pct(s.minChance)}: puede hacer falta más.</>}
                    </p>
                    <ul className="lv-mats" aria-label="Materiales">
                      {s.materials.map((m: any) => (
                        <li key={m.itemId} className="lv-chip"><span className="mono">{String(m.quantity)} ×</span><ItemLabel id={m.itemId} quality={m.quality} px={18} name={m.name ?? `Objeto ${m.itemId}`} />{m.priceSource === 'manual' && <span className="lv-manual">manual</span>}</li>
                      ))}
                    </ul>
                    <p className="lv-meta">
                      <HowToLearn r={s.recipe} />
                      <span aria-hidden="true">·</span>
                      <span>Dificultad <SkillColor c={s.colorFrom} />{s.colorTo !== s.colorFrom && <> a <SkillColor c={s.colorTo} /></>}</span>
                      <span aria-hidden="true">·</span>
                      <span className="icon-inline"><Timer size={12} aria-hidden="true" />{s.recipe.castSeconds !== null ? `${s.recipe.castSeconds} s c/u · ${secondsLabel(s.activeSeconds)}` : 'tiempo sin datos'}</span>
                      {!!s.recipe.tools.length && <><span aria-hidden="true">·</span><span>Herramienta: {s.recipe.tools.join(', ')}</span></>}
                      <span aria-hidden="true">·</span>
                      <a href={s.recipe.wowheadUrl} target="_blank" rel="noreferrer" className="icon-inline">Wowhead<ArrowSquareOut size={12} aria-hidden="true" /></a>
                    </p>
                  </div>
                  <div className="lv-cost"><Money v={s.cost} /></div>
                </>
              ) : (
                <div className="lv-main">
                  <p className="lv-gap-title"><Warning size={18} weight="bold" aria-hidden="true" />Sin ruta para estos niveles</p>
                  <p className="small lv-gap-reason">{s.reason}</p>
                  {!!s.missingItems.length && <p className="small muted">Materiales sin precio: {s.missingItems.slice(0, 8).map((m: any) => m.name ?? `Objeto ${m.itemId}`).join(', ')}{s.missingItems.length > 8 ? '…' : ''}. Puedes indicar precios manuales en «Subir nivel».</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <section className="card lv-shop">
          {!d.shopping.length ? <p className="muted">No hay materiales con precio para comprar.</p> : (
            <table className="lv-shop-table">
              <thead><tr><th>Material</th><th className="num">Cantidad</th><th className="num">Total</th></tr></thead>
              <tbody>{d.shopping.map((m: any) => (
                <tr key={m.itemId}><td><ItemLabel id={m.itemId} quality={m.quality} px={24} href={`#/materiales/${m.itemId}`} name={m.name ?? `Objeto ${m.itemId}`} /></td><td className="num">{String(m.quantity)}</td><td className="num"><Money v={m.cost} /><span className="lv-unit"><Money v={m.unitPrice} /> c/u</span></td></tr>
              ))}</tbody>
              <tfoot><tr><th colSpan={2}>Total materiales</th><td className="num"><Money v={d.materialsCost} /></td></tr></tfoot>
            </table>
          )}
        </section>
      )}
      <details className="card lv-details">
        <summary className="icon-inline"><Info size={16} aria-hidden="true" />¿Cómo se calcula?</summary>
        <ul className="small lv-notes">
          <li>{d.mode === 'rapida'
            ? <>Más rápida: en cada nivel, la receta con menor tiempo de fabricación esperado (tiempo de lanzamiento de Wowhead ÷ probabilidad).{d.budget ? <> Con presupuesto se buscan combinaciones que caben ({d.evaluated} evaluadas): es la más rápida <strong>entre las evaluadas</strong>, no un óptimo garantizado.</> : null}</>
            : <>Más barata: en cada nivel, la receta que sube un punto más barato.</>}</li>
          <li>El tiempo activo solo cuenta las fabricaciones. No incluye {d.notIncluded.join(', ')}: no hay datos verificados para estimarlo. Las recetas con reutilización no se usan, así que no hay esperas.</li>
          {d.recovery && <li>«Si vendieras lo fabricado» es hipotético: no se resta del costo ni decide la ruta (vender depende de la demanda). {d.recovery.stepsBound ? `${d.recovery.stepsBound} paso(s) crean objetos ligados (no se venden en la casa de subastas). ` : ''}{d.recovery.stepsWithoutPrice ? `${d.recovery.stepsWithoutPrice} paso(s) sin precio de venta.` : ''}</li>}
          <li>Probabilidad en amarillo y verde: {d.chanceModel === 'garantizado' ? 'no se usa (solo naranja).' : 'estimación de la comunidad (Blizzard no la publica).'}</li>
          <li>Precios: campo «{d.priceField}», escaneo {d.priceSourceTime ? `hace ${age(hoursSince(d.priceSourceTime))} (${dt(d.priceSourceTime)})` : 'sin datos'}. Recetas: <a href={d.source.url} target="_blank" rel="noreferrer">Wowhead</a> ({dt(d.source.fetchedAt)}); tiempos de lanzamiento comprobados el {d.source.castTimes.checkedAt}.</li>
          {d.knownRecipes > 0 && <li>{d.knownRecipes} receta(s) conocida(s) según Blizzard, sin costo de instructor{d.unmatchedKnownRecipes ? `; ${d.unmatchedKnownRecipes} no se pudieron enlazar con Wowhead` : ''}.</li>}
          <li>Algoritmo: {d.algorithm}.</li>
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
  const pname = (id: number) => profs.find((p) => p.id === id)?.name ?? `Profesión ${id}`;
  if (!plans.length) return null;
  const progress = async (payload: any) => {
    setBusy(true); setErr(null);
    try { await api(`/api/me/plans/${open}/progress`, { method: 'POST', body: payload }); setObs(''); detail.reload(); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm('¿Borrar esta ruta guardada y su progreso?')) return;
    await api(`/api/me/plans/${id}`, { method: 'DELETE' }); if (open === id) setOpen(null); onChanged();
  };
  const p = detail.data?.plan;
  return (
    <section className="card" aria-label="Rutas guardadas">
      <h2 className="pc-h2">Rutas guardadas</h2>
      <ul className="pc-plans">
        {plans.map((x) => (
          <li key={x.id} className={x.id === open ? 'on' : ''}>
            <button type="button" className="link" onClick={() => setOpen(x.id === open ? null : x.id)} aria-expanded={x.id === open}>
              {pname(x.professionId)} · {x.startSkill} → {x.target} · {x.mode === 'rapida' ? 'rápida' : 'barata'}
            </button>
            <span className={`badge ${x.status === 'completado' ? 'b-ok' : 'b-info'}`}>{x.status}</span>
            <span className="small muted">actualizada {dt(x.updatedAt)}</span>
            <button type="button" className="link danger" onClick={() => remove(x.id)} aria-label="Borrar ruta"><XCircle size={16} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      {open && detail.loading && <Loading label="Cargando ruta…" />}
      {p && (
        <div className="pc-progress">
          <form className="row" onSubmit={(e) => { e.preventDefault(); progress({ observedSkill: Number(obs) }); }}>
            <label className="field">Nivel que tienes ahora<input type="number" min={1} value={obs} onChange={(e) => setObs(e.target.value)} required /></label>
            <button type="submit" className="primary" disabled={busy}>Registrar y recalcular</button>
            <button type="button" onClick={() => progress({ sync: true })} disabled={busy}><ArrowsClockwise size={18} aria-hidden="true" />Leer de Blizzard</button>
          </form>
          {err && <p className="small lv-error" role="alert">{err}</p>}
          {!!p.progress.length && (
            <ol className="small pc-history">
              {p.progress.map((e: any, i: number) => <li key={i}>{dt(e.at)}: nivel {e.observedSkill} ({e.source === 'blizzard' ? 'Blizzard' : 'manual'}){e.note ? ` · ${e.note}` : ''}</li>)}
            </ol>
          )}
          {p.status === 'completado' ? <p className="lv-status ok"><CheckCircle size={18} aria-hidden="true" />Objetivo alcanzado.</p> : p.result && <RouteView d={p.result} />}
        </div>
      )}
    </section>
  );
}
