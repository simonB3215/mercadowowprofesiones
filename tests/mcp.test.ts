import { describe, it, expect, beforeAll } from 'vitest';

process.env.DATABASE_URL = 'pglite:memory';
const { getDb, migrate } = await import('../src/server/db.js');
const { createServer, gold } = await import('../src/mcp/server.js');
const { seedTestCatalog } = await import('./helpers/seed.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

let client: InstanceType<typeof Client>;
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content[0].text as string };
};

beforeAll(async () => {
  const db = await getDb();
  await migrate(db);
  await seedTestCatalog(db);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
});

describe('Servidor MCP', () => {
  it('expone solo herramientas de lectura', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['buscar_material', 'detalle_receta', 'estado_mercado', 'profesiones', 'recetas_rentables', 'ruta_subir_nivel', 'vender_o_usar_material'],
    );
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it('convierte cobre exacto en oro con 4 decimales; desconocido sigue siendo null', () => {
    expect(gold({ n: '123456', d: '1' })).toBe('12.3456');
    expect(gold('10000')).toBe('1');
    expect(gold({ n: '20001', d: '2' })).toBe('1'); // 1,00005 o: se muestra truncado a 4 decimales
    expect(gold(null)).toBeNull();
  });

  it('lista profesiones y recetas del catálogo', async () => {
    const p = await call('profesiones');
    expect(p.isError).toBe(false);
    expect(JSON.parse(p.text).length).toBeGreaterThan(0);
    const r = await call('recetas_rentables', { casa: 'normal-alliance', cantidad: 5 });
    expect(r.isError).toBe(false);
    const j = JSON.parse(r.text);
    expect(j.casa).toBe('normal-alliance');
    expect(j.recetas.length).toBeGreaterThan(0);
    expect(j.recetas.length).toBeLessThanOrEqual(5);
  });

  it('sin precios, la ruta de subida de nivel no inventa costos', async () => {
    const r = await call('ruta_subir_nivel', { profesionId: 197, desde: 1, hasta: 20 });
    expect(r.isError).toBe(false);
    const j = JSON.parse(r.text);
    expect(j.completa).toBe(false);
    expect(j.pasos[0].sinDatos).toBeTruthy();
  });

  it('los errores de la API llegan como error de la herramienta', async () => {
    const r = await call('detalle_receta', { recetaId: 1 });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/no encontrada/i);
    const bad = await call('ruta_subir_nivel', { profesionId: 197, desde: 50, hasta: 10 });
    expect(bad.isError).toBe(true);
  });
});
