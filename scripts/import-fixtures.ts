import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ImportFailure} from '../packages/contracts/src/index';
import {normalizePhoto} from './import-transport';
import type {ImportTransport} from '../packages/importers/src/network';
export function fixtureImportTransport(): ImportTransport {
  return {async load(url, kind, _hosts, signal) {
    signal.throwIfAborted();
    const u = new URL(url);
    if (u.hostname !== 'fixtures.bienvu.example') throw new ImportFailure('SOURCE_UNAVAILABLE', 'Recette hors ligne : source inconnue.');
    if (kind === 'page') {
      if (u.pathname === '/acces-refuse') throw new ImportFailure('SOURCE_BLOCKED', 'Refus synthétique du transport.', 'access_denied');
      const file = {'/vente': 'sale', '/location': 'rent', '/doublons': 'duplicates', '/contradiction': 'conflict', '/absent': 'missing-price', '/hors-annonce': 'not-listing',
        '/page-recherche': 'portals/search', '/annonce-retiree': 'portals/removed'}[u.pathname];
      if (!file) throw new ImportFailure('NOT_A_LISTING', 'Fixture absente.');
      const content = (await readFile(new URL(`../fixtures/imports/${file}.html`, import.meta.url), 'utf8')).replaceAll('https://fixtures.bienvu.example/vente', url);
      const bytes = new TextEncoder().encode(content);
      return {url, mime: 'text/html', bytes, sourceBytes: bytes.length};
    }
    const index = {'/photos/a.jpg': 0, '/photos/duplicate.jpg': 0, '/photos/b.jpg': 1, '/photos/c.jpg': 2}[u.pathname];
    if (index === undefined) throw new ImportFailure('INSUFFICIENT_PHOTOS', 'Photo de fixture absente.');
    const bytes = await sharp({create: {width: 960, height: 640, channels: 3, background: ['#214f43', '#af694d', '#cdc6a4'][index]}}).jpeg().toBuffer();
    return {url, sourceBytes: bytes.length, ...await normalizePhoto(bytes, 'image/jpeg')};
  }};
}
