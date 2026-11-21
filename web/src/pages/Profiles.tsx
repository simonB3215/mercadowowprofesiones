import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, dt, PageHead } from '../lib.js';
import { ItemPicker } from '../ItemPicker.js';
import { ItemLabel } from '../icons.js';
import { t } from '../i18n.js';

const empty = { name: '', faction: '', professions: [] as any[], knownRecipes: [] as number[], inventory: {} as Record<string, number> };

export function Profiles() {
  const { ctx, profileId, setProfileId } = useApp();
  const list = useAsync(() => api('/api/profiles'), []);
  const profs = useAsync(() => api(`/api/professions?version=${ctx.version}`), [ctx.version]);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeResults, setRecipeResults] = useState<any[]>([]);
  const [invId, setInvId] = useState('');
  const [invQty, setInvQty] = useState('');
  const [invName, setInvName] = useState('');

  useEffect(() => {
    const p = list.data?.profiles?.find((x: any) => x.id === profileId);
    if (p) { setEditing(p.id); setForm({ ...empty, ...p, faction: p.faction ?? '' }); }
  }, [list.data, profileId]);

  useEffect(() => {
    if (recipeSearch.trim().length < 2) { setRecipeResults([]); return; }
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ version: ctx.version, region: ctx.region, ...(ctx.realm ? { realm: ctx.realm } : {}), search: recipeSearch, pageSize: '20' });
      try { setRecipeResults((await api(`/api/opportunities?${q}`)).items); } catch { setRecipeResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [recipeSearch, ctx]);

  // Nombres para mostrar las recetas conocidas y el inventario (el perfil solo guarda los IDs).
  const recipeKey = [...form.knownRecipes].sort((a: number, b: number) => a - b).join(',');
  const invKey = Object.keys(form.inventory).sort().join(',');
  const recipeNames = useAsync(() => (recipeKey ? api(`/api/opportunities?version=${ctx.version}&region=${ctx.region}&ids=${recipeKey}&pageSize=200`) : Promise.resolve({ items: [] })), [recipeKey, ctx.version, ctx.region]);
  const itemNames = useAsync(() => (invKey ? api(`/api/items?version=${ctx.version}&ids=${invKey}`) : Promise.resolve({ items: [] })), [invKey, ctx.version]);
  const recipeName = (id: number) => recipeNames.data?.items?.find((x: any) => x.recipeId === id)?.name ?? `Receta ${id}`;
  const itemName = (id: number) => itemNames.data?.items?.find((x: any) => x.item_id === id)?.name ?? t('Objeto {id}', { id: id });

  const save = async () => {
    setMsg(null);
    try {
      const body = { ...form, faction: form.faction || null };
      if (editing) await api(`/api/profiles/${editing}`, { method: 'PUT', body });
      else {
        const r = await api('/api/profiles', { method: 'POST', body });
        setEditing(r.id);
        setProfileId(r.id);
      }
      setMsg(t('Perfil guardado.'));
      list.reload();
    } catch (e: any) { setMsg(e.message); }
  };
  const remove = async () => {
    if (!editing || !confirm(t('¿Eliminar este perfil? No se puede deshacer.'))) return;
    await api(`/api/profiles/${editing}`, { method: 'DELETE' });
    if (profileId === editing) setProfileId(null);
    setEditing(null); setForm(empty); list.reload();
  };
  const toggleProf = (id: number, on: boolean) =>
    setForm((f: any) => ({ ...f, professions: on ? [...f.professions, { professionId: id, skill: null }] : f.professions.filter((p: any) => p.professionId !== id) }));
  const setSkill = (id: number, v: string) =>
    setForm((f: any) => ({ ...f, professions: f.professions.map((p: any) => (p.professionId === id ? { ...p, skill: v === '' ? null : Number(v) } : p)) }));

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;

  return (
    <div>
      <PageHead title={t('Perfiles manuales')} />
      <div className="alert info" role="note">
        <div>
          <p><strong>{t('¿Perfil manual o «Mi personaje»?')}</strong></p>
          <p className="small">
            <a href="#/personaje">{t('Mi personaje')}</a>{' '}{t('lee tus personajes y profesiones de Battle.net automáticamente y calcula rutas para subirlas. Un perfil manual sirve para el')}{' '}<a href="#/">{t('comparador')}</a>{t(': le dices qué recetas conoces y qué materiales tienes, y se elige arriba en «Perfil manual» para filtrar y descontar inventario.')}</p>
        </div>
      </div>
      <p className="muted small">{t('Profesiones, recetas conocidas e inventario. Los datos desconocidos no se consideran requisitos cumplidos. El nivel de habilidad se guarda como dato de entrada, pero aún no se usa para validar requisitos (no hay reglas verificadas).')}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field">{t('Perfil')}<select value={editing ?? ''} onChange={(e) => {
            const p = list.data.profiles.find((x: any) => x.id === e.target.value);
            setEditing(p?.id ?? null); setForm(p ? { ...empty, ...p, faction: p.faction ?? '' } : empty);
            if (p) setProfileId(p.id);
          }}>
            <option value="">{t('+ Nuevo perfil')}</option>
            {list.data.profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {editing && <span className="small muted">{t('Actualizado:')}{' '}{dt(form.updatedAt)}{' '}{t('· procedencia: entrada manual')}</span>}
      </div>
      <section className="card">
        <div className="row">
          <label className="field">{t('Nombre')}<input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></label>
          <label className="field">{t('Facción')}<select value={form.faction} onChange={(e) => setForm({ ...form, faction: e.target.value })}>
              <option value="">{t('Sin indicar')}</option><option value="alliance">{t('Alianza')}</option><option value="horde">{t('Horda')}</option>
            </select>
          </label>
        </div>
        <h2>{t('Profesiones')}</h2>
        {profs.loading && <Loading label={t('Cargando profesiones…')} />}
        {profs.error && <ErrorBox error={profs.error} onRetry={profs.reload} />}
        {!profs.loading && !profs.error && !profs.data?.professions?.length && <p className="small muted">{t('No hay profesiones en el catálogo de esta versión.')}</p>}
        <div className="grid grid-3">
          {(profs.data?.professions ?? []).map((p: any) => {
            const mine = form.professions.find((x: any) => x.professionId === p.id);
            return (
              <div key={p.id} className="row" style={{ alignItems: 'center' }}>
                <label className="check"><input type="checkbox" checked={Boolean(mine)} onChange={(e) => toggleProf(p.id, e.target.checked)} /> {p.name}</label>
                {mine && <input type="number" min={0} aria-label={t('Habilidad en {x}', { x: p.name })} placeholder={t('habilidad')} style={{ width: 100 }} value={mine.skill ?? ''} onChange={(e) => setSkill(p.id, e.target.value)} />}
              </div>
            );
          })}
        </div>
        <h2>{t('Recetas conocidas (')}{form.knownRecipes.length})</h2>
        <label className="field" style={{ maxWidth: 420 }}>{t('Buscar receta para añadir')}<input type="search" value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} placeholder={t('nombre (mín. 2 letras)')} />
        </label>
        {recipeResults.length > 0 && (
          <ul className="small">
            {recipeResults.map((r) => (
              <li key={r.recipeId}>
                {r.name} <span className="muted">({r.profession})</span>{' '}
                {form.knownRecipes.includes(r.recipeId)
                  ? <span className="muted">{t('ya añadida')}</span>
                  : <button className="link" onClick={() => setForm({ ...form, knownRecipes: [...form.knownRecipes, r.recipeId] })}>{t('Añadir')}</button>}
              </li>
            ))}
          </ul>
        )}
        <ul className="small">
          {form.knownRecipes.map((id: number) => (
            <li key={id}><a href={`#/receta/${id}`}>{recipeName(id)}</a> <button className="link danger" onClick={() => setForm({ ...form, knownRecipes: form.knownRecipes.filter((x: number) => x !== id) })}>{t('Quitar')}</button></li>
          ))}
        </ul>
        <h2>{t('Inventario')}</h2>
        <p className="small muted">{t('Materiales que ya tienes en la bolsa o el banco. Se descuentan de la lista de compra; el costo de la receta sigue contando su precio de mercado.')}</p>
        <div className="row">
          <ItemPicker label={t('Material')} value={invId ? { id: Number(invId), name: invName || t('Objeto {id}', { id: invId }) } : null} onPick={(v) => { setInvId(v ? String(v.id) : ''); setInvName(v?.name ?? ''); }} />
          <label className="field">{t('Cantidad')}<input type="number" min={1} value={invQty} onChange={(e) => setInvQty(e.target.value)} /></label>
          <button onClick={() => {
            const n = Number(invQty);
            if (!/^\d+$/.test(invId) || !Number.isInteger(n) || n <= 0) { setMsg(t('Elige un material y escribe una cantidad mayor que 0.')); return; }
            setForm({ ...form, inventory: { ...form.inventory, [invId]: n } }); setInvId(''); setInvName(''); setInvQty('');
          }}>{t('Añadir / actualizar')}</button>
        </div>
        <ul className="small" style={{ listStyle: 'none', paddingLeft: 0 }}>
          {Object.entries(form.inventory).map(([k, v]) => (
            <li key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0' }}><ItemLabel id={Number(k)} px={24} href={`#/materiales/${k}`} name={itemName(Number(k))} sub={`${String(v)} unid.`} /> <button className="link danger" onClick={() => { const inv = { ...form.inventory }; delete inv[k]; setForm({ ...form, inventory: inv }); }}>{t('Quitar')}</button></li>
          ))}
          {!Object.keys(form.inventory).length && <li className="muted">{t('Sin inventario registrado.')}</li>}
        </ul>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={save}>{t('Guardar perfil')}</button>
          {editing && <button className="danger" onClick={remove}>{t('Eliminar perfil')}</button>}
        </div>
        {msg && <p role="status" className="small">{msg}</p>}
      </section>
    </div>
  );
}
