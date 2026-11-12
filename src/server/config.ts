/** Contextos de mercado soportados y parámetros configurables. */

export type GameVersion = 'retail' | 'demo';

export interface VersionInfo {
  id: string;
  label: string;
  enabled: boolean;
  reason?: string;
  regions: string[];
  tsmGameType?: string;
  blizzardNamespace?: (region: string) => string;
}

/**
 * Retail es la única versión habilitada (PB-26). Las demás existen en TSM
 * (comprobado: classic, classic-progression, forever devuelven 200) pero falta
 * validar su catálogo de recetas, mercados y comisiones.
 */
export const VERSIONS: VersionInfo[] = [
  {
    id: 'retail',
    label: 'Retail',
    enabled: true,
    regions: ['us', 'eu', 'kr', 'tw'],
    tsmGameType: 'retail',
    blizzardNamespace: (r) => `static-${r}`,
  },
  {
    id: 'classic',
    label: 'Classic (Era)',
    enabled: false,
    regions: [],
    reason: 'TSM publica datos, pero el catálogo de recetas, las facciones y las comisiones de Classic no están validados (PB-26).',
  },
  {
    id: 'classic-progression',
    label: 'Classic progresión (Mists of Pandaria)',
    enabled: false,
    regions: [],
    reason: 'Pendiente de validar catálogo y reglas propias (PB-26).',
  },
  {
    id: 'demo',
    label: 'DEMO — datos ficticios',
    enabled: true,
    regions: ['demo'],
    reason: 'Modo de demostración con objetos y precios inventados. Nunca son resultados reales.',
  },
];

export const REGION_LABEL: Record<string, string> = {
  us: 'Norteamérica / Oceanía (US)',
  eu: 'Europa (EU)',
  kr: 'Corea (KR)',
  tw: 'Taiwán (TW)',
  demo: 'Demo',
};

export interface Settings {
  /** Comisión de subasta como decimal (supuesto configurable; verificar por mercado). */
  commission: string;
  /** Fuente de precio para materiales. */
  buySource: PriceField;
  /** Fuente de precio para la venta del resultado. */
  sellSource: PriceField;
  minProfitUnitGold: string;
  minRoiPct: string;
  minSaleRate: number;
  minSoldPerDay: number;
  /** Antigüedad máxima (horas) de precios de reino y commodities. */
  maxAgeHoursRealm: number;
  /** Antigüedad máxima (horas) de estadísticas regionales. */
  maxAgeHoursRegion: number;
}

export type PriceField = 'marketValue' | 'minBuyout' | 'recent' | 'historical' | 'regionMarketValue' | 'regionAvgSalePrice';

export const PRICE_FIELD_LABEL: Record<PriceField, string> = {
  marketValue: 'marketValue (reino/commodity)',
  minBuyout: 'minBuyout (reino/commodity)',
  recent: 'recent (reino/commodity)',
  historical: 'historical (reino/commodity)',
  regionMarketValue: 'marketValue regional',
  regionAvgSalePrice: 'avgSalePrice regional',
};

export const DEFAULT_SETTINGS: Settings = {
  commission: '0.05',
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
