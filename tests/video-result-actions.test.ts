import assert from 'node:assert/strict';
import test from 'node:test';
import { GenerationView } from '../packages/contracts/src/index';
import { videoResultActions } from '../apps/web/lib/video-result-actions';

const now = Date.parse('2026-10-18T10:00:00Z');
const video = GenerationView.parse({
  id: '29695510-c311-41a5-8bc7-3ff93b4f9530',
  status: 'ready',
  stage: 'rendering',
  attempt: 1,
  errorCode: null,
  createdAt: '2026-10-18T09:00:00Z',
  updatedAt: '2026-10-18T09:05:00Z',
  expiresAt: null,
  title: 'Maison à La Rochelle',
  videoUrl: '/api/generations/video/preview',
  downloadUrl: '/api/generations/video/download',
  syntheticVoice: true,
  retryAllowed: false,
});

test('Completed videos expose the same download, editor and publishing destinations', () => {
  for (const role of ['owner', 'admin', 'editor'] as const) {
    const actions = videoResultActions(video, role, now);
    assert.equal(actions?.downloadUrl, video.downloadUrl);
    assert.equal(actions?.editorUrl, `/editeur?video=${video.id}`);
    assert.equal(actions?.canPublish, true);
  }
});

test('Read-only members keep downloads without editing or publishing controls', () => {
  assert.deepEqual(videoResultActions(video, 'viewer', now), {
    downloadUrl: video.downloadUrl,
    editorUrl: null,
    canPublish: false,
  });
});

test('A locked or reserved master never exposes a download or a publication action', () => {
  for (const masterAccess of ['locked', 'reserved'] as const) {
    const actions = videoResultActions({ ...video, masterAccess }, 'editor', now);
    assert.equal(actions?.downloadUrl, null);
    assert.equal(actions?.canPublish, false);
    assert.ok(actions?.editorUrl, 'Existing editing access is retained');
  }
  assert.equal(videoResultActions({ ...video, downloadUrl: null }, 'editor', now)?.canPublish, false);
});

test('Trials and signed-out visitors cannot reach account result actions', () => {
  assert.equal(videoResultActions({ ...video, ownership: 'anonymous' }, 'owner', now), null);
  assert.equal(videoResultActions(video, null, now), null);
});

test('Incomplete and unavailable videos never offer final-result actions', () => {
  for (const status of ['queued', 'importing', 'scripting', 'voicing', 'rendering', 'retry_wait', 'failed'] as const)
    assert.equal(videoResultActions({ ...video, status }, 'owner', now), null);
  for (const retention of ['expired', 'expiring'] as const)
    assert.equal(videoResultActions({ ...video, retention }, 'owner', now), null);
  assert.equal(videoResultActions({ ...video, videoUrl: null }, 'owner', now), null);
  assert.equal(videoResultActions({ ...video, expiresAt: new Date(now).toISOString() }, 'owner', now), null);
  assert.equal(videoResultActions({ ...video, expiresAt: new Date(now - 1).toISOString() }, 'owner', now), null);
  assert.ok(videoResultActions({ ...video, expiresAt: new Date(now + 1).toISOString() }, 'owner', now));
});
