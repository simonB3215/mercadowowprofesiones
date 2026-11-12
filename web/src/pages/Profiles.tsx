import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, dt } from '../lib.js';

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
      setMsg('Perfil guardado.');
      list.reload();
    } catch (e: any) { setMsg(e.message); }
  };
  const remove = async () => {
    if (!editing || !confirm('¿Eliminar este perfil? No se puede deshacer.')) return;
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
      <h1>Perfil del personaje</h1>
      <p className="muted small">Perfil manual: profesiones, recetas conocidas e inventario. Los datos desconocidos no se consideran requisitos cumplidos. El nivel de habilidad se guarda como dato de entrada, pero aún no se usa para validar requisitos (no hay reglas verificadas).</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field">Perfil
          <select value={editing ?? ''} onChange={(e) => {
            const p = list.data.profiles.find((x: any) => x.id === e.target.value);
            setEditing(p?.id ?? null); setForm(p ? { ...empty, ...p, faction: p.faction ?? '' } : empty);
            if (p) setProfileId(p.id);
          }}>
            <option value="">+ Nuevo perfil</option>
            {list.data.profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {editing && <span className="small muted">Actualizado: {dt(form.updatedAt)} · procedencia: entrada manual</span>}
      </div>
      <section className="card">
        <div className="row">
          <label className="field">Nombre<input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></label>
          <label className="field">Facción
            <select value={form.faction} onChange={(e) => setForm({ ...form, faction: e.target.value })}>
              <option value="">Sin indicar</option><option value="alliance">Alianza</option><option value="horde">Horda</option>
            </select>
          </label>
        </div>
        <h2>Profesiones</h2>
        {!profs.data?.professions?.length && <p className="small muted">No hay profesiones en el catálogo de esta versión.</p>}
        <div className="grid grid-3">
          {(profs.data?.professions ?? []).map((p: any) => {
            const mine = form.professions.find((x: any) => x.professionId === p.id);
            return (
              <div key={p.id} className="row" style={{ alignItems: 'center' }}>
                <label className="check"><input type="checkbox" checked={Boolean(mine)} onChange={(e) => toggleProf(p.id, e.target.checked)} /> {p.name}</label>
                {mine && <input type="number" min={0} aria-label={`Habilidad en ${p.name}`} placeholder="habilidad" style={{ width: 100 }} value={mine.skill ?? ''} onChange={(e) => setSkill(p.id, e.target.value)} />}
              </div>
            );
          })}
        </div>
        <h2>Recetas conocidas ({form.knownRecipes.length})</h2>
        <label className="field" style={{ maxWidth: 420 }}>Buscar receta para añadir
          <input type="search" value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} placeholder="nombre (mín. 2 letras)" />
        </label>
        {recipeResults.length > 0 && (
          <ul className="small">
            {recipeResults.map((r) => (
              <li key={r.recipeId}>
                {r.name} <span className="muted">({r.profession})</span>{' '}
                {form.knownRecipes.includes(r.recipeId)
                  ? <span className="muted">ya añadida</span>
                  : <button className="link" onClick={() => setForm({ ...form, knownRecipes: [...form.knownRecipes, r.recipeId] })}>Añadir</button>}
              </li>
            ))}
          </ul>
        )}
        <ul className="small">
          {form.knownRecipes.map((id: number) => (
            <li key={id}><a href={`#/receta/${id}`}>Receta {id}</a> <button className="link danger" onClick={() => setForm({ ...form, knownRecipes: form.knownRecipes.filter((x: number) => x !== id) })}>Quitar</button></li>
          ))}
        </ul>
        <h2>Inventario</h2>
        <p className="small muted">Por identificador de objeto. El inventario reduce las compras, pero el costo económico se sigue calculando a precio de reposición.</p>
        <div className="row">
          <label className="field">ID del objeto<input type="number" value={invId} onChange={(e) => setInvId(e.target.value)} /></label>
          <label className="field">Cantidad<input type="number" min={1} value={invQty} onChange={(e) => setInvQty(e.target.value)} /></label>
          <button onClick={() => {
            const n = Number(invQty);
            if (!/^\d+$/.test(invId) || !Number.isInteger(n) || n <= 0) { setMsg('ID y cantidad deben ser enteros positivos.'); return; }
            setForm({ ...form, inventory: { ...form.inventory, [invId]: n } }); setInvId(''); setInvQty('');
          }}>Añadir / actualizar</button>
        </div>
        <ul className="small">
          {Object.entries(form.inventory).map(([k, v]) => (
            <li key={k}>Objeto {k}: {String(v)} unid. <button className="link danger" onClick={() => { const inv = { ...form.inventory }; delete inv[k]; setForm({ ...form, inventory: inv }); }}>Quitar</button></li>
          ))}
          {!Object.keys(form.inventory).length && <li className="muted">Sin inventario registrado.</li>}
        </ul>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={save}>Guardar perfil</button>
          {editing && <button className="danger" onClick={remove}>Eliminar perfil</button>}
        </div>
        {msg && <p role="status" className="small">{msg}</p>}
      </section>
    </div>
  );
}
