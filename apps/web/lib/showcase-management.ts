import type { AgencyProfile, ShowcasePrivate } from '@bienvu/contracts';
import { readShowcaseItems } from '@bienvu/db';
import { ensureShowcase, showcasePropertySelection, showcasePropertyIssues, showcaseFactsHash } from './showcases';
import { listShowcaseLeads, showcaseStatistics, type ShowcaseContactEnv } from './showcase-contacts';
import { emailConfigured } from './auth-email';
import { RequestFailure } from './http';
export async function showcaseManagement(
  env: ShowcaseContactEnv,
  agency: AgencyProfile,
  role: string,
  params = new URLSearchParams(),
): Promise<ShowcasePrivate> {
  const days = Number(params.get('days') ?? 30);
  if (days !== 7 && days !== 30) throw new RequestFailure('VALIDATION_ERROR');
  const [row, items, selection, inbox, stats] = await Promise.all([
    ensureShowcase(env, agency),
    readShowcaseItems(env.DB, agency.id),
    showcasePropertySelection(env, agency.id, params),
    listShowcaseLeads(env, agency.id, params.get('leadCursor')),
    showcaseStatistics(env, agency.id, days),
  ]);
  const details = [];
  for (const item of items) {
    const group =
      selection.groups.find((g) => g.summary.id === item.propertyId || g.aliases.includes(item.propertyId)) ?? null;
    details.push({
      ...item,
      groupId: group?.summary.id ?? null,
      title: group?.summary.title ?? 'Bien retiré',
      issues: showcasePropertyIssues(group, item.draft),
      videoOutdated: Boolean(
        item.draft.video && group && item.draft.video.factsHash !== (await showcaseFactsHash(group.summary.fields)),
      ),
    });
  }
  return {
    version: row.version,
    status: row.status,
    draft: row.draft,
    published: row.published,
    publishedAt: row.publishedAt,
    logoUrl: row.draft.logoAssetId ? `/api/vitrine/assets/${row.draft.logoAssetId}` : null,
    coverUrl: row.draft.coverAssetId ? `/api/vitrine/assets/${row.draft.coverAssetId}` : null,
    items: details,
    properties: selection.properties,
    total: selection.total,
    nextCursor: selection.nextCursor,
    ...inbox,
    stats,
    canConfigure: ['owner', 'admin'].includes(role),
    canEdit: role !== 'viewer',
    emailConfigured: emailConfigured(env),
  };
}
