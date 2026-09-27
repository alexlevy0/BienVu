// Outil opérateur local, jamais importé dans le Worker. Les identités de la sonde
// sont synthétiques. Aucun point d’entrée de connexion factice dans l’application.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const fixture = JSON.parse(await readFile('evidence/local/sprint-02/accounts-fixture.json', 'utf8'));
if (fixture.base !== 'http://localhost:8787' || !/^bienvu\.session_token=[a-zA-Z0-9%.=_-]+$/.test(fixture.cookie)) throw new Error('Fixture locale invalide.');
const server = createServer((request, response) => {
  if (request.headers.host !== 'localhost:8790' || request.url !== '/' || request.method !== 'GET'
    || !['none', 'same-site', undefined].includes(request.headers['sec-fetch-site'])) {response.writeHead(403); response.end(); return;}
  response.writeHead(302, {'Location': `${fixture.base}/agence`, 'Set-Cookie': `${fixture.cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'});
  response.end(); server.close();
});
server.listen(8790, 'localhost', () => console.log('Session de recette locale : ouvrir http://localhost:8790/ une seule fois, dans la minute.'));
const timer = setTimeout(() => server.close(), 60000);
server.on('close', () => clearTimeout(timer));
