import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coverageForHost, coverageSources, importSources, sourceCoverage, sourceForHost, summarizeSourceCoverage,
  type SourceSample} from '../packages/contracts/src/index';
import {sourcePolicy} from '../packages/importers/src/network';

const sample = (outcome: SourceSample['outcome'], environment: SourceSample['environment'] = 'cloudflare'): SourceSample => ({
  url: 'https://www.example.com/bien/123', label: 'Annonce de recette', checkedAt: '2026-10-05', environment,
  outcome, photos: outcome === 'complete' ? 3 : 0, note: 'Recette unitaire, aucun essai public.',
});

test('les brouillons partiels et explorations locales ne deviennent pas des imports complets confirmés', () => {
  const partial = summarizeSourceCoverage({summary: 'Recette', samples: [sample('partial')]});
  assert.equal(partial.successfulImports, 0); assert.equal(partial.partialImports, 1); assert.equal(partial.status, 'partial_import');
  const local = summarizeSourceCoverage({summary: 'Recette', samples: [sample('complete', 'local_https')]});
  assert.equal(local.successfulImports, 0); assert.equal(local.status, 'generic_to_try');
  const mixed = summarizeSourceCoverage({summary: 'Recette', samples: [sample('complete'), sample('failed')]});
  assert.equal(mixed.successfulImports, 1); assert.equal(mixed.listingAttempts, 2); assert.equal(mixed.status, 'mixed_results');
});

test('un échec récent ne masque pas un précédent succès et conserve la date de chaque essai', () => {
  const previous = {...sample('complete'), checkedAt: '2026-09-28'};
  const result = summarizeSourceCoverage({summary: 'Recette', samples: [sample('failed'), previous]});
  assert.equal(result.checkedAt, '2026-10-05'); assert.equal(result.status, 'mixed_results');
  assert.equal(result.samples[1]?.checkedAt, '2026-09-28');
});

test('la reconnaissance du catalogue public ne change aucune permission du transport', () => {
  for (const host of ['www.laforet.com', 'courbevoie.guy-hoquet.com', 'www.safti.fr']) {
    assert.ok(coverageForHost(host)); assert.equal(sourceForHost(host), undefined);
    assert.deepEqual(sourcePolicy(`https://${host}/annonce`), {pageHosts: [host], imageHosts: [host]});
  }
  assert.equal(coverageForHost('www.guy-hoquet.com.attacker.example'), undefined);
  assert.equal(coverageForHost('fakeguy-hoquet.com'), undefined);
  assert.equal(coverageForHost('courbevoie.guy-hoquet.com')?.id, 'guy-hoquet');
});

test('les résultats publiés ont des preuves datées et des compteurs qui excluent les échecs', () => {
  assert.equal(new Set(coverageSources.map(s => s.id)).size, coverageSources.length);
  for (const registered of importSources) assert.ok(coverageSources.some(s => s.id === registered.id));
  for (const source of coverageSources) {
    const result = sourceCoverage[source.id];
    assert.equal(new Set(result.samples.map(s => `${s.url}-${s.testedAt ?? s.checkedAt}`)).size, result.samples.length);
    assert.equal(result.listingAttempts, result.samples.length);
    assert.equal(result.successfulImports, result.samples.filter(s => s.outcome === 'complete' && s.environment === 'cloudflare').length);
    for (const proof of result.samples) {
      assert.match(proof.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
      if (proof.testedAt) {assert.ok(Number.isFinite(Date.parse(proof.testedAt))); assert.equal(proof.testedAt.slice(0, 10), proof.checkedAt);}
      assert.equal(new URL(proof.url).protocol, 'https:');
      assert.equal(coverageForHost(new URL(proof.url).hostname)?.id, source.id);
      if (proof.outcome === 'complete') assert.ok(proof.photos >= 3);
    }
  }
});
