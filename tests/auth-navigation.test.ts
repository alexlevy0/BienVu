import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authLoginPath, authReturnPath} from '../apps/web/lib/auth-navigation';
import {socialCalendarPreview} from '../apps/web/lib/social-calendar-preview';
import {SocialPublication} from '../packages/contracts/src/index';

test('la reprise après connexion reste dans le studio et conserve les paramètres du projet', () => {
  for (const path of ['/agence', '/publications', '/editeur?guest=1', '/equipe?invitation=test', '/abonnement', '/']) assert.equal(authReturnPath(path), path);
  for (const path of ['https://foreign.example/agence', '//foreign.example/agence', '/\\foreign.example/agence', '/api/agency', '/connexion', '/agence\n', '/agence/../../api/agency', null, 42]) assert.equal(authReturnPath(path), null);
  assert.equal(authLoginPath('/publications', {verified:'1'}), '/connexion?verified=1&next=%2Fpublications');
});
test('l’aperçu du calendrier utilise seulement les médias publics et des dates du mois choisi', () => {
  const posts = socialCalendarPreview(new Date(2028,1,1), new Date(2028,1,16));
  assert.equal(posts.length, 3);
  for (const post of posts) {
    SocialPublication.parse(post);
    assert.equal(new Date(post.scheduledAt).getMonth(), 1);
    assert.equal(new Date(post.scheduledAt).getFullYear(), 2028);
    assert.match(post.videoUrl, /^\/videos\/studio-home\/[a-z]+\.mp4$/);
    assert.match(post.thumbnail!, /^\/images\/studio-home\/[a-z]+\.webp$/);
    assert.ok(post.targets.every(target => target.connectionId === null && target.permalink === null));
  }
  assert.equal(posts[0].targets[0].status, 'published');
  assert.equal(posts[2].targets[0].status, 'scheduled');
});
