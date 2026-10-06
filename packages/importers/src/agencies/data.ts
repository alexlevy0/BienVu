import {ImportFailure, sameSourceHost} from '@bienvu/contracts';
import {absolute, attr, rawText, tag, type HtmlNode} from '../html';
import {numeric, unique, verified, missing} from '../facts';
import {publicUrl} from '../network';

export const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const schemaTypes = (value: Record<string, unknown>) => (Array.isArray(value['@type']) ? value['@type'] : [value['@type']]).map(v => String(v).replace(/^https?:\/\/schema.org\//, ''));
export function schemaNodes(documents: unknown[]) {
  const nodes = documents.flatMap(v => Array.isArray(v) ? v : array(object(v)['@graph']).length ? array(object(v)['@graph']) : [v]).map(object);
  if (nodes.length > 200 || nodes.some(n => schemaTypes(n).some(t => ['ItemList', 'CollectionPage', 'SearchResultsPage'].includes(t))))
    throw new ImportFailure('NOT_A_LISTING', 'Une liste de résultats ne constitue pas une annonce.', 'not_listing');
  return nodes;
}
export function listingIdentity(value: unknown, url: string) {
  if (typeof value !== 'string' || !value) throw new ImportFailure('INCOMPLETE_LISTING', 'Identité de l’annonce absente.');
  // Les @id JSON-LD désignent souvent une entité par fragment ; ce fragment
  // n'est pas une destination réseau et n'est jamais téléchargé.
  const entity = new URL(absolute(value, url)); entity.hash = '';
  const candidate = publicUrl(entity.href), current = publicUrl(url);
  if (!sameSourceHost(candidate.hostname, current.hostname) || candidate.pathname !== current.pathname)
    throw new ImportFailure('CONFLICTING_FACTS', 'Les données désignent une autre annonce.');
}
export function embeddedJson(nodes: HtmlNode[], id: string): unknown {
  const scripts = nodes.filter(n => tag(n) === 'script' && attr(n, 'id') === id && attr(n, 'type') === 'application/json');
  if (scripts.length !== 1) throw new ImportFailure(scripts.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'Données de la fiche non identifiées.', 'structure_changed');
  const content = rawText(scripts[0]);
  if (content.length > 512_000) throw new ImportFailure('NOT_A_LISTING', 'Données de la fiche trop volumineuses.');
  try {return JSON.parse(content);} catch {throw new ImportFailure('NOT_A_LISTING', 'Données de la fiche illisibles.', 'structure_changed');}
}
export function euroAmount(value: unknown, commaGrouping = false) {
  if (typeof value === 'number') return numeric(value);
  if (typeof value !== 'string') return null;
  let raw = value.replace(/\s/g, '').replace(/€$/, '');
  // Ce format est explicitement affiché par Estatik ; pas de changement au
  // parseur générique, où une virgule pourrait être un séparateur décimal.
  if (commaGrouping && /^\d{1,3}(?:,\d{3})+$/.test(raw)) raw = raw.replaceAll(',', '');
  return numeric(raw);
}
export function salePrice(amounts: number[], sourcePath: string) {
  const amount = unique(amounts, 'Prix de vente contradictoires.');
  return amount === undefined ? missing('EUR_cent') : verified({amountCents: Math.round(amount * 100), currency: 'EUR' as const,
    period: 'total' as const, charges: 'not_applicable' as const}, 'EUR_cent', sourcePath, amount);
}
export function compareNumber(expected: number | null, value: unknown, message: string) {
  const actual = numeric(value);
  if (expected !== null && actual !== null) unique([expected, actual], message);
}
