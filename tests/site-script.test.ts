import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import type { AddressInfo } from 'net';

// The site script (scripts/strapi-site.mts) run the way strapi_site runs it: the accounts as a first line, the
// script after it, piped to `node --input-type=module-typescript - <verbs>` in the folder of the app. Node.js
// runs the TypeScript file as it is. config and schema on a folder laid out like create-strapi's; the accounts
// against a stand-in for the admin's API.

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const SCRIPT = fs.readFileSync(path.join(PKG, 'scripts', 'strapi-site.mts'), 'utf8');

const OWNER = { handle: 'owner', firstname: 'webmaster', lastname: '', email: 'webmaster@example.com', password: 'Owner.pass.123' };
const ACCOUNTS = [
  { handle: 'editor', firstname: 'Editor', lastname: 'Webship', email: 'editor@example.com', password: 'Editor.pass.123', role: 'strapi-editor' },
  { handle: 'author', firstname: 'Author', lastname: 'Webship', email: 'author@example.com', password: 'Author.pass.123', role: 'strapi-author' },
];

function site(verbs: string[], cwd: string, base = 'http://127.0.0.1:1', given: object = { owner: OWNER, accounts: ACCOUNTS }): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module-typescript', '-', ...verbs], { cwd, env: { ...process.env, STRAPI_SITE_URL: base, STRAPI_SITE_ACCOUNTS: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(`globalThis.STRAPI_SITE_ACCOUNTS = '${Buffer.from(JSON.stringify(given)).toString('base64')}';\n${SCRIPT}`);
  });
}

/** A folder of an app as create-strapi leaves it, as far as config reads it. */
function appFolder(): string {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'strapi-site-'));
  fs.mkdirSync(path.join(app, 'config'));
  fs.writeFileSync(path.join(app, 'config', 'server.ts'), [
    'export default ({ env }) => ({',
    "  host: env('HOST', '0.0.0.0'),",
    "  port: env.int('PORT', 1337),",
    '  app: {',
    "    keys: env.array('APP_KEYS'),",
    '  },',
    '});',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(app, '.env'), 'HOST=0.0.0.0\nPORT=1337\n');
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'app', strapi: { uuid: 'a-uuid' } }, null, 2) + '\n');
  fs.writeFileSync(path.join(app, 'tsconfig.json'), '{}\n');
  return app;
}

test('config gives the app its address and proxy, no survey, telemetry off, no release notification; again, the same files', async () => {
  const app = appFolder();
  const r = await site(['config', 'https://app1.ddev.site'], app);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'config: the site answers at https://app1.ddev.site, behind the proxy; telemetry off; no survey pop-up; no release notification\n');
  const server = fs.readFileSync(path.join(app, 'config', 'server.ts'), 'utf8');
  assert.match(server, /^ {2}port: env\.int\('PORT', 1337\),\n {2}\/\/ Webship test site: the address of the site and the proxy in front of it\.\n {2}url: env\('PUBLIC_URL', 'https:\/\/app1\.ddev\.site'\),\n {2}proxy: \{ koa: env\.bool\('IS_PROXIED', true\) \},$/m);
  assert.match(fs.readFileSync(path.join(app, '.env'), 'utf8'), /^FLAG_NPS=false$/m);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).strapi, { uuid: 'a-uuid', telemetryDisabled: true });
  assert.match(fs.readFileSync(path.join(app, 'src', 'admin', 'app.tsx'), 'utf8'), /notifications: \{ releases: false \}/);
  const files = ['config/server.ts', '.env', 'package.json', 'src/admin/app.tsx'].map((f) => fs.readFileSync(path.join(app, f), 'utf8'));
  const again = await site(['config', 'https://app1.ddev.site'], app);
  assert.strictEqual(again.status, 0, again.stderr);
  assert.deepStrictEqual(['config/server.ts', '.env', 'package.json', 'src/admin/app.tsx'].map((f) => fs.readFileSync(path.join(app, f), 'utf8')), files);
});

test('schema writes the content model: three content types with their API files, and four components', async () => {
  const app = appFolder();
  const r = await site(['schema'], app);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'schema: Article, Category, Homepage, and the components Quote, Rich text, Media and Seo\n');
  for (const name of ['article', 'category', 'homepage']) {
    const model = JSON.parse(fs.readFileSync(path.join(app, 'src', 'api', name, 'content-types', name, 'schema.json'), 'utf8'));
    assert.strictEqual(model.info.singularName, name);
    for (const part of ['routes', 'controllers', 'services']) {
      assert.match(fs.readFileSync(path.join(app, 'src', 'api', name, part, `${name}.ts`), 'utf8'), new RegExp(`'api::${name}\\.${name}'`));
    }
  }
  assert.deepStrictEqual(fs.readdirSync(path.join(app, 'src', 'components', 'shared')).sort(), ['media.json', 'quote.json', 'rich-text.json', 'seo.json']);
});

test('the site script refuses an address it is not given, a verb it does not know, and a run with no owner', async () => {
  const app = appFolder();
  const noUrl = await site(['config'], app);
  assert.strictEqual(noUrl.status, 1);
  assert.strictEqual(noUrl.stderr.trim(), 'config needs the address of the site: config https://<name>.ddev.site');
  const unknown = await site(['schema', 'publish'], app);
  assert.strictEqual(unknown.status, 1);
  assert.strictEqual(unknown.stderr.trim(), 'strapi-site.mts takes config <url>, schema, accounts <add|cancel|list|installed>, locales or seed, not publish');
  const noOwner = await site(['accounts', 'list'], app, 'http://127.0.0.1:1', { owner: null, accounts: [] });
  assert.strictEqual(noOwner.status, 1);
  assert.strictEqual(noOwner.stderr.trim(), 'No owner account in STRAPI_SITE_ACCOUNTS.');
});

interface StandInUser { id: number; firstname: string; lastname: string; email: string; password?: string; isActive: boolean; roles: { id: number; code: string; name: string }[] }

/** A stand-in for the admin's API: the login, the roles and the admin users, as the admin answers them. */
async function admin() {
  const ROLES = [{ id: 1, code: 'strapi-super-admin', name: 'Super Admin' }, { id: 2, code: 'strapi-editor', name: 'Editor' }, { id: 3, code: 'strapi-author', name: 'Author' }];
  const state = { logins: 0, users: [{ id: 1, firstname: 'webmaster', lastname: '', email: OWNER.email, password: OWNER.password, isActive: true, roles: [ROLES[0]!] }] as StandInUser[], next: 1 };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const answer = (status: number, json: object | null) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(json ? JSON.stringify(json) : ''); };
      const url = new URL(req.url || '/', 'http://admin');
      if (req.method === 'POST' && url.pathname === '/admin/login') {
        state.logins++;
        const owner = state.users[0];
        if (!owner || body.email !== owner.email || body.password !== owner.password) return answer(400, { error: { name: 'ValidationError', message: 'Invalid credentials' } });
        return answer(200, { data: { token: 'a-token' } });
      }
      if (req.headers.authorization !== 'Bearer a-token') return answer(401, { error: { name: 'UnauthorizedError', message: 'Missing or invalid credentials' } });
      if (req.method === 'GET' && url.pathname === '/admin/roles') return answer(200, { data: ROLES });
      if (req.method === 'GET' && url.pathname === '/admin/users') return answer(200, { data: { results: state.users.map(({ password, ...user }) => user) } });
      if (req.method === 'POST' && url.pathname === '/admin/users') {
        const user: StandInUser = { id: ++state.next + 10, firstname: body.firstname, lastname: body.lastname, email: body.email, isActive: false, roles: ROLES.filter((r) => body.roles.includes(r.id)) };
        state.users.push(user);
        return answer(201, { data: user });
      }
      const one = /^\/admin\/users\/(\d+)$/.exec(url.pathname);
      const user = one ? state.users.find((u) => u.id === Number(one[1])) : undefined;
      if (req.method === 'PUT' && user) {
        Object.assign(user, { firstname: body.firstname, lastname: body.lastname, password: body.password, isActive: body.isActive, roles: ROLES.filter((r) => body.roles.includes(r.id)) });
        return answer(200, { data: user });
      }
      if (req.method === 'DELETE' && user) {
        state.users = state.users.filter((u) => u !== user);
        return answer(200, { data: user });
      }
      return answer(404, { error: { name: 'NotFoundError', message: `${req.method} ${url.pathname}` } });
    });
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { state, base, close: () => new Promise<void>((resolve) => { server.close(() => resolve()); }) };
}

test('the accounts are added with their roles and passwords, listed and deleted, with one login a run', async () => {
  const a = await admin();
  const app = appFolder();
  try {
    assert.strictEqual((await site(['accounts', 'installed'], app, a.base)).status, 0, 'the owner can log in');
    const added = await site(['accounts', 'add'], app, a.base);
    assert.strictEqual(added.status, 0, added.stderr);
    assert.strictEqual(added.stdout, '   editor@example.com: Editor Webship, Editor, active\n   author@example.com: Author Webship, Author, active\n');
    assert.deepStrictEqual(a.state.users.map((u) => [u.email, u.roles.map((r) => r.code).join(), u.isActive, u.password]), [
      ['webmaster@example.com', 'strapi-super-admin', true, 'Owner.pass.123'],
      ['editor@example.com', 'strapi-editor', true, 'Editor.pass.123'],
      ['author@example.com', 'strapi-author', true, 'Author.pass.123'],
    ]);
    const again = await site(['accounts', 'add'], app, a.base);
    assert.strictEqual(again.status, 0, again.stderr);
    assert.strictEqual(a.state.users.length, 3, 'an account that is there is given its name, password and role back, not made again');

    const listed = await site(['accounts', 'list'], app, a.base);
    assert.deepStrictEqual(listed.stdout.split('\n').filter(Boolean).map((l) => l.trim().split(/\s{2,}/)), [
      ['webmaster@example.com', 'webmaster', 'Super Admin', 'active'], ['editor@example.com', 'Editor Webship', 'Editor', 'active'], ['author@example.com', 'Author Webship', 'Author', 'active']]);

    const cancelled = await site(['accounts', 'cancel'], app, a.base);
    assert.strictEqual(cancelled.stdout, '   editor@example.com: deleted\n   author@example.com: deleted\n');
    const gone = await site(['accounts', 'cancel'], app, a.base);
    assert.strictEqual(gone.stdout, '   editor@example.com: not on the site\n   author@example.com: not on the site\n');
    assert.deepStrictEqual(a.state.users.map((u) => u.email), ['webmaster@example.com']);
    assert.strictEqual(a.state.logins, 6, 'one login for each of the six runs');

    const wrongRole = await site(['accounts', 'add'], app, a.base, { owner: OWNER, accounts: [{ ...ACCOUNTS[0], role: 'strapi-publisher' }] });
    assert.strictEqual(wrongRole.status, 1);
    assert.strictEqual(wrongRole.stderr.trim(), 'No role "strapi-publisher" on the site; it has: Super Admin (strapi-super-admin), Editor (strapi-editor), Author (strapi-author)');
    const wrongPassword = await site(['accounts', 'installed'], app, a.base, { owner: { ...OWNER, password: 'another' }, accounts: [] });
    assert.strictEqual(wrongPassword.status, 1, 'a site whose owner cannot log in is not installed');
  } finally {
    await a.close();
  }
});
