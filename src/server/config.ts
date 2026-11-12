/** Contextos de mercado soportados y parámetros configurables. */

export type GameVersion = 'forever';

export type HouseFaction = 'alliance' | 'horde' | 'neutral';

export interface FixedRealm {
  slug: string;
  name: string;
  faction: HouseFaction;
  /** Id de la casa en /data/wow/ruleset/{r}/auctions/{id} (namespace dynamic-forever-{región}). */
  blizzardHouseId: number;
  /** TSM publica esta casa (/forever/{región}/realm/{slug}/items.csv). */
  tsm: boolean;
}

export interface VersionInfo {
  id: GameVersion;
  label: string;
  enabled: boolean;
  regions: string[];
  tsmGameType: string;
  blizzardNamespace: (region: string) => string;
  /** Casas de subastas (WoW Forever no tiene reinos: una por modo de juego y facción). */
  fixedRealms: FixedRealm[];
  realmLabel: string;
}

/**
 * La aplicación trabaja solo con World of Warcraft: Forever (decisión del usuario, 12-11-2026).
 * Verificado con datos reales (ver docs/VALIDACION_FUENTES.md):
 * - TSM: /forever/us/region/items.csv y /forever/us/realm/{modo}-{facción}/items.csv; no hay commodities.
 * - Blizzard: namespace static-forever-us con profesiones, recetas y objetos completos;
 *   no hay índice de reinos (Forever no tiene reinos).
 */
/*
 * Casas de subastas de Blizzard (dynamic-forever-us): 15 casas en 5 grupos de Alianza / Horda / Aguasnegras
 * (neutral). El grupo 112/115/118 está vacío (¿Hardcore, aún sin lanzar?). La API no nombra el modo de cada
 * grupo; se verificó el 12-11-2026 comparando el minBuyout de cada casa con los CSV de TSM: 111↔normal-alliance
 * 61 % de coincidencias exactas (frente a 11 % con pvp), 110↔pvp-alliance 60 %, 119↔roleplay-alliance 76 %.
 * Los slugs coinciden con los de TSM; TSM no publica Aguasnegras.
 */
type Mode = { key: string; label: string; ids: [number, number, number]; tsm: boolean };
const MODES: Mode[] = [
  { key: 'normal', label: 'Normal', ids: [111, 114, 117], tsm: true },
  { key: 'pvp', label: 'JcJ', ids: [110, 113, 116], tsm: true },
  { key: 'roleplay', label: 'Rol', ids: [119, 120, 121], tsm: true },
  { key: 'roleplay-pvp', label: 'Rol JcJ', ids: [123, 124, 125], tsm: true },
];
const SIDES: Array<{ key: string; label: string; faction: HouseFaction }> = [
  { key: 'alliance', label: 'Alianza', faction: 'alliance' },
  { key: 'horde', label: 'Horda', faction: 'horde' },
  { key: 'aguasnegras', label: 'Aguasnegras (neutral)', faction: 'neutral' },
];
export const FOREVER_REALMS: FixedRealm[] = MODES.flatMap((m) =>
  SIDES.map((s, i) => ({
    slug: `${m.key}-${s.key}`,
    name: `${m.label} — ${s.label}`,
    faction: s.faction,
    blizzardHouseId: m.ids[i],
    tsm: m.tsm && s.faction !== 'neutral',
  })),
);

export function findHouse(slug: string | null | undefined): FixedRealm | undefined {
  return FOREVER_REALMS.find((r) => r.slug === slug);
}

export const FOREVER: VersionInfo = {
  id: 'forever',
  label: 'WoW Forever',
  enabled: true,
  regions: ['us'],
  tsmGameType: 'forever',
  blizzardNamespace: (r) => `static-forever-${r}`,
  fixedRealms: FOREVER_REALMS,
  realmLabel: 'Casa de subastas',
};

export const VERSIONS: VersionInfo[] = [FOREVER];

export const REGION_LABEL: Record<string, string> = {
  us: 'Américas y Oceanía (US)',
};

export interface Settings {
  /** Comisión de subasta de las casas de facción, como decimal (supuesto configurable). */
  commission: string;
  /** Comisión de la casa neutral de Aguasnegras (supuesto configurable). */
  commissionNeutral: string;
  /** Fuente de precio para materiales. */
  buySource: PriceField;
  /** Fuente de precio para la venta del resultado. */
  sellSource: PriceField;
  minProfitUnitGold: string;
  minRoiPct: string;
  minSaleRate: number;
  minSoldPerDay: number;
  /** Antigüedad máxima (horas) de precios de la casa de subastas. */
  maxAgeHoursRealm: number;
  /** Antigüedad máxima (horas) de estadísticas regionales. */
  maxAgeHoursRegion: number;
}

export type PriceField = 'marketValue' | 'minBuyout' | 'recent' | 'historical' | 'regionMarketValue' | 'regionAvgSalePrice';

export const PRICE_FIELD_LABEL: Record<PriceField, string> = {
  marketValue: 'marketValue (casa de subastas)',
  minBuyout: 'minBuyout (casa de subastas)',
  recent: 'recent (casa de subastas)',
  historical: 'historical (casa de subastas)',
  regionMarketValue: 'marketValue regional',
  regionAvgSalePrice: 'avgSalePrice regional',
};

export const DEFAULT_SETTINGS: Settings = {
  commission: '0.05',
  commissionNeutral: '0.15',
  buySource: 'marketValue',
  sellSource: 'marketValue',
  minProfitUnitGold: '1',
  minRoiPct: '10',
  minSaleRate: 0.05,
  minSoldPerDay: 1,
  maxAgeHoursRealm: 12,
  maxAgeHoursRegion: 48,
};

export const TSM_BASE = process.env.TSM_BASE_URL ?? 'https://public-data.tradeskillmaster.com';

/** Comisión que corresponde a la casa de subastas del contexto. */
export function commissionFor(settings: Settings, realm: string | null | undefined): string {
  return findHouse(realm)?.faction === 'neutral' ? settings.commissionNeutral : settings.commission;
}
