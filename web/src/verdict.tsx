import React from 'react';
import { CheckCircle, WarningCircle, Question, TrendDown, MinusCircle } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { t } from './i18n.js';

/** ¿Conviene fabricarla para vender? (lo calcula el servidor: potionVerdict). */
export type Verdict = 'si' | 'poco' | 'dudoso' | 'no' | 'sin_datos';

/** Veredicto: etiqueta, explicación, icono y tono (el mismo orden que las tarjetas). */
export const VERDICT: Array<[Verdict, string, string, Icon, string]> = [
  ['si', 'Sí, conviene', 'Gana oro y se vende bien en la región: cumple tus objetivos de Ajustes.', CheckCircle, 'ok'],
  ['poco', 'Gana poco', 'Deja algo de oro, pero se vende poco o el margen no llega a tus objetivos de Ajustes.', WarningCircle, 'warn'],
  ['dudoso', 'Precio dudoso', 'El precio de venta parece una sola publicación cara: no te fíes de la ganancia.', Question, 'info'],
  ['no', 'No conviene', 'Con los precios de hoy, fabricarla para vender pierde oro o no gana nada.', TrendDown, 'bad'],
  ['sin_datos', 'Sin datos', 'Falta algún precio para calcularlo.', MinusCircle, 'neutral'],
];
const V = Object.fromEntries(VERDICT.map((v) => [v[0], v])) as Record<Verdict, (typeof VERDICT)[number]>;
const BADGE: Record<string, string> = { ok: 'b-ok', warn: 'b-warn', info: 'b-info', bad: 'b-bad', neutral: 'b-neutral' };

/** Por qué una receta no tiene ventas de la región (campo noSales del servidor): texto corto y explicación. */
const NO_SALES: Record<string, [string, string]> = {
  vinculado: ['se liga: no se vende en subasta', 'El objeto se liga al recogerlo o a la cuenta, así que no se puede vender en la casa de subastas.'],
  servicio: ['encantamiento: no se vende', 'La receta no fabrica un objeto (encantamiento o efecto): no se vende en la casa de subastas.'],
  no_existe: ['objeto que Blizzard no reconoce', 'La API de Blizzard no tiene este objeto; seguramente no se puede conseguir en WoW Forever.'],
  desactualizado: ['datos regionales viejos', 'Las estadísticas regionales son más antiguas que el máximo de Ajustes, así que no se usan.'],
  sin_region: ['aún sin estadísticas regionales', 'Está a la venta en tu casa de subastas, pero TradeSkillMaster todavía no tiene estadísticas regionales.'],
  sin_comercio: ['nadie la vende en la región', 'TradeSkillMaster no tiene ningún registro: nadie la ha vendido ni publicado en la región.'],
};
export function NoSales({ why }: { why: string | null | undefined }) {
  const [label, help] = NO_SALES[why ?? ''] ?? ['sin datos de ventas', 'No hay datos de ventas de la región.'];
  return <span className="small muted no-sales" title={t(help)}>{t(label)}</span>;
}

export function VerdictBadge({ v }: { v: Verdict }) {
  const [, label, help, I, tone] = V[v] ?? V.sin_datos;
  return <span className={`badge ${BADGE[tone]}`} title={t(help)}><I size={14} weight="bold" aria-hidden="true" />{t(label)}</span>;
}
