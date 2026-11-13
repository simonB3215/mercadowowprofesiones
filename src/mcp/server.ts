/**
 * Servidor MCP de solo lectura: deja que un asistente (Claude Code, Claude Desktop…) consulte los datos de la
 * aplicación — estado del mercado, recetas rentables, detalle de una receta, materiales y rutas de subida de nivel.
 *
 * Llama a la misma API (`handle` de src/server/router.ts) dentro del proceso, solo con GET: no sincroniza precios
 * ni escribe nada. Usa la base de datos de DATABASE_URL (.env). Si la web exige APP_PASSWORD, la sesión se genera
 * aquí mismo a partir de esa variable; la contraseña nunca sale del proceso.
 *
 * Importes en oro con 4 decimales (1 oro = 100 platas = 10 000 cobres). Un valor desconocido es null, nunca 0.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { handle } from '../server/router.js';
import { authRequired, sessionCookie } from '../server/auth.js';
import { FOREVER_REALMS } from '../server/config.js';
import { Q, COPPER_PER_GOLD } from '../engine/rational.js';
import { cooldownLabel } from '../engine/cooldown.js';

const DEFAULT_HOUSE = 'pvp-horde';
const HOUSES = FOREVER_REALMS.map((r) => r.slug) as [string, ...string[]];

type QJson = { n: string; d: string } | null | undefined;
const isQ = (v: unknown): v is { n: string; d: string } =>
  !!v && typeof v === 'object' && typeof (v as any).n === 'string' && typeof (v as any).d === 'string';
/** Cobre exacto → oro con 4 decimales (texto). */
export const gold = (v: QJson | string | number): string | null => {
  if (v === null || v === undefined) return null;
  const q = isQ(v) ? Q.fromJSON(v) : Q.parse(String(v));
  return q.div(Q.of(COPPER_PER_GOLD)).toDecimal(4);
};
const round1 = (h: number | null | undefined) => (h === null || h === undefined ? null : Math.round(h * 10) / 10);
const num = (v: QJson, digits = 2): string | null => (isQ(v) ? Q.fromJSON(v).toDecimal(digits) : null);

export class ApiError extends Error {}

async function get(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<any> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const url = `http://localhost${path}${qs.size ? `?${qs}` : ''}`;
  const headers: Record<string, string> = {};
  if (authRequired()) headers.cookie = sessionCookie(new Request(url)).split(';')[0];
  const res = await handle(new Request(url, { headers }));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error ?? `HTTP ${res.status}`);
  return body;
}

const ctx = (casa?: string) => ({ version: 'forever', region: 'us', realm: casa ?? DEFAULT_HOUSE });
const out = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: e instanceof ApiError ? e.message : `Error: ${(e as Error).message}` }] });
const safe = <A>(fn: (a: A) => Promise<unknown>) => async (a: A) => {
  try {
    return out(await fn(a));
  } catch (e) {
    return fail(e);
  }
};

const casa = z.enum(HOUSES).optional().describe(`Casa de subastas (modo-facción). Por defecto ${DEFAULT_HOUSE}.`);

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'mercado-wow-profesiones', version: '0.1.0' },
    {
      instructions:
        'Datos de WoW Forever (región US): precios de la casa de subastas, rentabilidad de recetas y rutas de subida de nivel. ' +
        'Solo lectura. Importes en oro con 4 decimales; null = sin datos (nunca significa 0). ' +
        'Las ganancias son estimaciones con los precios actuales; revisa «estado» y «motivos» antes de recomendar una receta, ' +
        'y «precioAtipico» (una sola publicación cara puede inflar el precio de venta).',
    },
  );

  server.registerTool('estado_mercado', {
    title: 'Estado de los precios',
    description: 'Antigüedad de los precios de la casa de subastas y de las estadísticas regionales de TSM, y si están desactualizados.',
    inputSchema: { casa },
    annotations: { readOnlyHint: true },
  }, safe(async ({ casa: c }: { casa?: string }) => {
    const s = await get('/api/market/status', ctx(c));
    return {
      casa: s.ctx.realm,
      fuentes: s.files.map((f: any) => ({
        fuente: f.label, ambito: f.scope, horasDeAntiguedad: round1(f.sourceAgeHours),
        desactualizado: f.stale, limiteHoras: f.maxAgeHours, datosDe: f.active?.sourceTime ?? null, descargado: f.active?.fetchedAt ?? null,
        precios: f.active?.rows ?? null, proveedor: f.active?.provider ?? null,
        ultimoIntento: f.lastAttempt ? { cuando: f.lastAttempt.at, estado: f.lastAttempt.status, error: f.lastAttempt.error ?? null } : null,
      })),
    };
  }));

  server.registerTool('profesiones', {
    title: 'Profesiones',
    description: 'Profesiones del catálogo con su id (para filtrar recetas o pedir una ruta de subida de nivel) y número de recetas.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, safe(async () => {
    const [cat, lv] = await Promise.all([get('/api/professions', { version: 'forever' }), get('/api/leveling/professions', { version: 'forever' })]);
    const lvById = new Map<number, any>(lv.professions.map((p: any) => [p.id, p]));
    return cat.professions.map((p: any) => ({
      id: Number(p.id), nombre: p.name, nombreIngles: p.name_en, tipo: p.kind, recetas: p.recipes,
      subidaDeNivel: lvById.has(Number(p.id)) ? { nivelMaximo: lvById.get(Number(p.id)).maxSkill, objetivoPorDefecto: lvById.get(Number(p.id)).defaultTo } : null,
    }));
  }));

  server.registerTool('recetas_rentables', {
    title: 'Recetas rentables',
    description: 'Lista de recetas evaluadas con los precios actuales: costo, precio de venta, ganancia estimada, ROI, demanda regional y estado. Ordenadas por ganancia por unidad (las de precio atípico van al final).',
    inputSchema: {
      casa,
      buscar: z.string().max(80).optional().describe('Texto en el nombre de la receta (español).'),
      profesionId: z.number().int().optional().describe('Id de la profesión (herramienta «profesiones»).'),
      orden: z.enum(['ganancia', 'roi', 'lote', 'costo']).optional().describe('Ganancia por unidad (defecto), ROI, ganancia por lote o costo por unidad.'),
      ascendente: z.boolean().optional(),
      estados: z.array(z.enum(['candidato', 'demanda_incierta', 'margen_insuficiente', 'no_rentable', 'datos_insuficientes', 'no_fabricable', 'no_vendible'])).optional()
        .describe('Filtrar por estado. «candidato» = rentable con demanda.'),
      ocultarNoVendibles: z.boolean().optional().describe('Quitar objetos ligados o servicios.'),
      cantidad: z.number().int().min(1).max(50).optional().describe('Máximo de recetas (defecto 15).'),
      pagina: z.number().int().min(1).optional(),
    },
    annotations: { readOnlyHint: true },
  }, safe(async (a: any) => {
    const sort = ({ ganancia: 'profitUnit', roi: 'roi', lote: 'profitBatch', costo: 'cost' } as const)[a.orden as 'ganancia' ?? 'ganancia'] ?? 'profitUnit';
    const r = await get('/api/opportunities', {
      ...ctx(a.casa), search: a.buscar, professionId: a.profesionId, sort, dir: a.ascendente ? 'asc' : 'desc',
      status: a.estados?.join(','), hideUnsellable: a.ocultarNoVendibles ? 1 : undefined, pageSize: a.cantidad ?? 15, page: a.pagina,
    });
    return {
      casa: r.ctx.realm, total: r.total, pagina: r.page, porEstado: r.counts,
      recetas: r.items.map((e: any) => ({
        recetaId: e.recipeId, receta: e.name, profesion: e.profession, objeto: e.output?.name ?? null, objetoId: e.output?.itemId ?? null, calidad: e.output?.quality ?? null,
        unidadesPorFabricacion: e.unitsPerRun, costoUnidad: gold(e.costUnit), precioVenta: gold(e.sellPrice), ambitoPrecioVenta: e.sellScope,
        gananciaUnidad: gold(e.profitUnit), gananciaLote: gold(e.profitBatch), roiPct: e.roiUndefined ? 'no definido (costo 0)' : num(e.roiPct, 1),
        precioAtipico: e.sellCheck ? (e.sellCheck.kind === 'atipico' ? `${num(e.sellCheck.ratio, 1)}× el valor regional` : 'sin referencia regional') : null,
        ventasPorDia: e.demand?.soldPerDay ?? null, tasaDeVenta: e.demand?.saleRate ?? null,
        reutilizacion: e.cooldown ? `una fabricación cada ${cooldownLabel(e.cooldown)}` : e.cooldown === 0 ? 'ninguna' : 'desconocida',
        estado: e.status, motivos: e.reasons, canal: e.channel, preciosDe: e.sourceTime,
      })),
    };
  }));

  server.registerTool('detalle_receta', {
    title: 'Detalle de una receta',
    description: 'Materiales con su precio y procedencia, costo, ingreso neto, ganancia, ROI, precio de equilibrio, demanda, antigüedad de los precios y estado con motivos.',
    inputSchema: { recetaId: z.number().int().describe('Id de la receta (de «recetas_rentables»).'), casa },
    annotations: { readOnlyHint: true },
  }, safe(async ({ recetaId, casa: c }: { recetaId: number; casa?: string }) => {
    const { evaluation: e, settings } = await get(`/api/recipes/${recetaId}`, ctx(c));
    return {
      recetaId: e.recipeId, receta: e.name, profesion: e.profession, objeto: e.output, unidadesPorFabricacion: e.unitsPerRun, rendimiento: e.yieldRange,
      materiales: e.reagents.map((g: any) => ({
        objetoId: g.itemId, nombre: g.name, cantidad: g.quantity, precioUnidad: gold(g.price.copper), campo: g.price.field, ambito: g.price.scope,
        preciosDe: g.price.sourceTime, subtotal: gold(g.subtotal),
      })),
      costoMateriales: gold(e.cost.materials), costoLote: gold(e.cost.batch), costoUnidad: gold(e.cost.unit), sinPrecio: e.cost.missing,
      precioVenta: { oro: gold(e.sellPrice.copper), campo: e.sellPrice.field, ambito: e.sellPrice.scope, preciosDe: e.sellPrice.sourceTime },
      precioAtipico: e.sellCheck ? { tipo: e.sellCheck.kind, motivo: e.sellCheck.reason } : null,
      comision: settings.commission, ingresoNeto: gold(e.profit.netRevenue), gananciaLote: gold(e.profit.profitBatch), gananciaUnidad: gold(e.profit.profitUnit),
      roiPct: e.profit.roiUndefined ? 'no definido (costo 0)' : num(e.profit.roiPct, 1), precioEquilibrio: gold(e.profit.breakEven),
      precioMinimoPublicable: e.profit.minListPrice === null || e.profit.minListPrice === undefined ? null : gold(e.profit.minListPrice),
      demandaRegional: e.demand ? { ventasPorDia: e.demand.soldPerDay, tasaDeVenta: e.demand.saleRate, precioMedioVenta: gold(e.demand.avgSalePrice) } : null,
      antiguedadHoras: { casa: round1(e.freshness.localHours), region: round1(e.freshness.regionHours), desactualizado: e.freshness.stale },
      reutilizacion: e.cooldown ? `una fabricación cada ${cooldownLabel(e.cooldown)}` : e.cooldown === 0 ? 'ninguna' : 'desconocida',
      canal: e.channel, motivoCanal: e.channelReason, estado: e.status, motivos: e.reasons, notas: e.notes,
    };
  }));

  server.registerTool('buscar_material', {
    title: 'Buscar material',
    description: 'Busca materiales de fabricación por nombre (español o inglés) y devuelve su id y en cuántas recetas se usan.',
    inputSchema: { texto: z.string().min(2).max(60) },
    annotations: { readOnlyHint: true },
  }, safe(async ({ texto }: { texto: string }) => {
    const r = await get('/api/materials', { version: 'forever', search: texto });
    return r.materials.slice(0, 25).map((m: any) => ({ objetoId: Number(m.item_id), nombre: m.name, recetasQueLoUsan: m.uses }));
  }));

  server.registerTool('vender_o_usar_material', {
    title: 'Vender o usar un material',
    description: 'Compara vender un material en la casa de subastas (neto de comisión) con usarlo en cada receta: valor que aporta cada unidad.',
    inputSchema: { objetoId: z.number().int(), casa, cantidad: z.number().int().min(1).max(50).optional().describe('Máximo de recetas (defecto 10).') },
    annotations: { readOnlyHint: true },
  }, safe(async ({ objetoId, casa: c, cantidad }: { objetoId: number; casa?: string; cantidad?: number }) => {
    const r = await get(`/api/materials/${objetoId}`, ctx(c));
    return {
      objetoId: r.itemId, nombre: r.name, precio: gold(r.price.copper), ambito: r.price.scope, preciosDe: r.price.sourceTime,
      ventaNeta: gold(r.sellNet), comision: r.commission,
      usos: r.alternatives.slice(0, cantidad ?? 10).map((x: any) => ({
        recetaId: x.recipeId, receta: x.name, profesion: x.profession, cantidad: x.quantity, valorPorUnidad: gold(x.valuePerUnit), estado: x.status, motivos: x.reasons,
      })),
    };
  }));

  server.registerTool('ruta_subir_nivel', {
    title: 'Ruta para subir de nivel',
    description: 'Ruta más barata para subir una profesión con los precios actuales: receta por tramo, fabricaciones, materiales, costo, costo del instructor y lista de compra. No usa recetas con tiempo de reutilización.',
    inputSchema: {
      profesionId: z.number().int().describe('171 Alquimia, 164 Herrería, 333 Encantamiento, 202 Ingeniería, 165 Peletería, 197 Sastrería, 185 Cocina, 129 Primeros auxilios, 186 Minería.'),
      desde: z.number().int().min(1).optional().describe('Nivel actual (defecto 1).'),
      hasta: z.number().int().optional().describe('Nivel objetivo (defecto 300).'),
      incluirPatrones: z.boolean().optional().describe('Incluir recetas de patrón, botín o misión (defecto: solo instructor e iniciales).'),
      casa,
    },
    annotations: { readOnlyHint: true },
  }, safe(async (a: { profesionId: number; desde?: number; hasta?: number; incluirPatrones?: boolean; casa?: string }) => {
    const r = await get('/api/leveling', { ...ctx(a.casa), profession: a.profesionId, from: a.desde ?? 1, to: a.hasta ?? 300, trainerOnly: a.incluirPatrones ? 0 : 1 });
    const nm = (m: any) => m.name ?? `Objeto ${m.itemId}`;
    return {
      profesion: r.profession.name, desde: r.from, hasta: r.to, soloInstructor: r.trainerOnly, campoDePrecio: r.priceField, preciosDe: r.priceSourceTime,
      completa: !r.incomplete, totalMateriales: gold(r.materialsCost), totalInstructor: gold(r.trainingCost), total: gold(r.total),
      pasos: r.steps.map((s: any) => s.recipe ? {
        niveles: `${s.from}→${s.to}`, receta: s.recipe.name ?? s.recipe.nameEn, recetaIngles: s.recipe.nameEn, fabricaciones: s.crafts,
        dificultad: s.colorFrom === s.colorTo ? s.colorFrom : `${s.colorFrom}→${s.colorTo}`,
        comoSeAprende: s.recipe.availability === 'instructor' ? `instructor (nivel ${s.recipe.learnedAt}, ${gold(s.recipe.trainingCost)} oro)` : s.recipe.availability === 'inicial' ? 'se conoce al aprender la profesión' : 'patrón, botín o misión',
        materiales: s.materials.map((m: any) => `${m.quantity} × ${nm(m)}${m.unitPrice ? '' : ' (sin precio)'}`), costo: gold(s.cost), wowhead: s.recipe.wowheadUrl,
      } : { niveles: `${s.from}→${s.to}`, sinDatos: s.reason, materialesSinPrecio: s.missingItems.map(nm) }),
      listaDeCompra: r.shopping.map((m: any) => ({ objetoId: m.itemId, nombre: nm(m), cantidad: m.quantity, precioUnidad: gold(m.unitPrice), costo: gold(m.cost), fuente: m.priceSource })),
    };
  }));

  return server;
}
