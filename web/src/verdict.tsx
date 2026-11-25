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

export function VerdictBadge({ v }: { v: Verdict }) {
  const [, label, help, I, tone] = V[v] ?? V.sin_datos;
  return <span className={`badge ${BADGE[tone]}`} title={t(help)}><I size={14} weight="bold" aria-hidden="true" />{t(label)}</span>;
}
