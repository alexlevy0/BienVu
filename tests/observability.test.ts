import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticRecord, requestContext} from '../packages/observability/src/index';
import {publicFailure} from '../packages/contracts/src/index';

test('journaux sur liste blanche : aucun cookie, clé, URL signée, corps ou stack', () => {
  const context = requestContext();
  const input = {event: 'request_failed' as const, status: 500, code: 'INTERNAL_ERROR' as const,
    jobId: 'job-fixture', stage: 'rendering', authorization: 'Bearer secret-token', cookie: 'session=secret-cookie',
    url: 'https://example.com/?signature=secret-query', body: {apiKey: 'secret-key'}, stack: 'secret-stack'};
  const serialized = JSON.stringify(diagnosticRecord(context, input));
  assert.doesNotMatch(serialized, /secret-|signature|authorization|cookie|stack/);
  assert.match(serialized, /job-fixture/);
  assert.equal(publicFailure('INTERNAL_ERROR', context.requestId).body.error.requestId, context.requestId);
  assert.notEqual(context.requestId, requestContext().requestId);
});
