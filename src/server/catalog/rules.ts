/**
 * Reglas versionadas de catálogo para Retail. Son decisiones de la aplicación,
 * documentadas en docs/DECISIONES.md, no datos de Blizzard.
 */

/** Clasificación de profesiones por nombre en inglés devuelto por la API. */
export const PROFESSION_KIND: Record<string, 'fabricacion' | 'recoleccion' | 'secundaria' | 'historica'> = {
  Alchemy: 'fabricacion',
  Blacksmithing: 'fabricacion',
  Enchanting: 'fabricacion',
  Engineering: 'fabricacion',
  Inscription: 'fabricacion',
  Jewelcrafting: 'fabricacion',
  Leatherworking: 'fabricacion',
  Tailoring: 'fabricacion',
  Cooking: 'secundaria',
  Mining: 'recoleccion',
  Herbalism: 'recoleccion',
  Skinning: 'recoleccion',
  Fishing: 'recoleccion',
  Archaeology: 'historica',
  'First Aid': 'historica',
};

export const PROFESSION_ES: Record<string, string> = {
  Alchemy: 'Alquimia', Blacksmithing: 'Herrería', Enchanting: 'Encantamiento', Engineering: 'Ingeniería',
  Inscription: 'Inscripción', Jewelcrafting: 'Joyería', Leatherworking: 'Peletería', Tailoring: 'Sastrería',
  Cooking: 'Cocina', Mining: 'Minería', Herbalism: 'Herboristería', Skinning: 'Desuello', Fishing: 'Pesca',
  Archaeology: 'Arqueología', 'First Aid': 'Primeros auxilios',
};

/** Profesiones que el producto debe mostrar aunque el catálogo aún no las tenga (cobertura, PB-06). */
export const REQUIRED_PROFESSIONS = [
  'Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Inscription', 'Jewelcrafting', 'Leatherworking',
  'Tailoring', 'Cooking', 'Mining', 'Herbalism', 'Skinning', 'Fishing',
];

/**
 * Expansión a partir del prefijo del nombre (en inglés) del rango de habilidad (skill tier).
 * Un prefijo desconocido queda como "Sin clasificar" y aparece en la cobertura.
 */
export const EXPANSION_PREFIXES: Array<[RegExp, string, number]> = [
  [/^(Classic|Vanilla)\b/i, 'Clásico', 1],
  [/^Outland\b/i, 'The Burning Crusade', 2],
  [/^Northrend\b/i, 'Wrath of the Lich King', 3],
  [/^Cataclysm\b/i, 'Cataclysm', 4],
  [/^Pandaria\b/i, 'Mists of Pandaria', 5],
  [/^Draenor\b/i, 'Warlords of Draenor', 6],
  [/^Legion\b/i, 'Legion', 7],
  [/^(Kul Tiran|Zandalari)\b/i, 'Battle for Azeroth', 8],
  [/^Shadowlands\b/i, 'Shadowlands', 9],
  [/^Dragon Isles\b/i, 'Dragonflight', 10],
  [/^Khaz Algar\b/i, 'The War Within', 11],
  [/^(Midnight|Quel'Thalas)\b/i, 'Midnight', 12],
];

export function expansionOf(tierNameEn: string | null): { name: string; order: number } {
  if (!tierNameEn) return { name: 'Sin clasificar', order: 99 };
  for (const [re, name, order] of EXPANSION_PREFIXES) if (re.test(tierNameEn)) return { name, order };
  return { name: 'Sin clasificar', order: 99 };
}

/**
 * Expansiones con sistema de calidades de fabricación. Para estas recetas la calidad
 * del resultado depende de habilidad/reactivos y TSM no distingue variantes de equipo
 * (un solo itemId por fila). Sin reglas verificadas → sin recomendación automática.
 */
export const QUALITY_SYSTEM_EXPANSIONS = new Set(['Dragonflight', 'The War Within', 'Midnight']);
