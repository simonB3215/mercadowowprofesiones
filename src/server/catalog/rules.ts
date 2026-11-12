/**
 * Reglas versionadas de catálogo (WoW Forever). Son decisiones de la aplicación,
 * documentadas en docs/DECISIONES.md, no datos de Blizzard.
 */

/** Clasificación de profesiones por nombre en inglés devuelto por la API. */
export const PROFESSION_KIND: Record<string, 'fabricacion' | 'recoleccion' | 'secundaria' | 'historica'> = {
  Alchemy: 'fabricacion',
  Blacksmithing: 'fabricacion',
  Enchanting: 'fabricacion',
  Engineering: 'fabricacion',
  Leatherworking: 'fabricacion',
  Tailoring: 'fabricacion',
  Cooking: 'secundaria',
  Mining: 'recoleccion',
  Herbalism: 'recoleccion',
  Skinning: 'recoleccion',
  Fishing: 'recoleccion',
  'First Aid': 'secundaria',
};

export const PROFESSION_ES: Record<string, string> = {
  Alchemy: 'Alquimia', Blacksmithing: 'Herrería', Enchanting: 'Encantamiento', Engineering: 'Ingeniería',
  Leatherworking: 'Peletería', Tailoring: 'Sastrería',
  Cooking: 'Cocina', Mining: 'Minería', Herbalism: 'Herboristería', Skinning: 'Desuello', Fishing: 'Pesca',
  'First Aid': 'Primeros auxilios',
};

/**
 * Profesiones de WoW Forever que el producto debe mostrar aunque el catálogo aún no las tenga
 * (cobertura, PB-06). Verificado en static-forever-us: sin Inscripción ni Joyería; Primeros
 * auxilios es una profesión secundaria activa.
 */
export const FOREVER_PROFESSIONS = [
  'Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Leatherworking', 'Tailoring',
  'Cooking', 'First Aid', 'Mining', 'Herbalism', 'Skinning', 'Fishing',
];

export const requiredProfessions = (_version?: string) => FOREVER_PROFESSIONS;

export function professionKind(nameEn: string, _version?: string): 'fabricacion' | 'recoleccion' | 'secundaria' | 'historica' | undefined {
  return PROFESSION_KIND[nameEn];
}

/** Profesiones internas de la API que no son de juego (por ejemplo, "Test Profession [DNT]"). */
export const isInternalProfession = (nameEn: string | null) => !!nameEn && /\[DNT\]|^Test Profession/i.test(nameEn);

/** WoW Forever tiene un único rango por profesión (p. ej. "Alchemy"), sin expansiones. */
export function expansionOf(_tierNameEn?: string | null, _version?: string): { name: string; order: number } {
  return { name: 'WoW Forever', order: 1 };
}
