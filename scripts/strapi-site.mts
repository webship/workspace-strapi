// The test site of the step pack: what the build adds to an app the official
// installer (create-strapi) made. Run with the Node.js of the web container, in
// the folder of the app, by .github/scripts/build-ddev-site.sh of the step pack
// (its JavaScript copy) and by the Webship Workspace's Strapi plugin (this
// TypeScript file):
//
//   node --input-type=module-typescript - config <url>   the address of the site and the proxy in front of it, telemetry off
//   node --input-type=module-typescript - schema         the content model, as schema files
//   node --input-type=module-typescript - accounts add   the accounts (an account already there gets its name, password, role and active state back)
//   node --input-type=module-typescript - accounts cancel | list | installed
//   node --input-type=module-typescript - locales        the second locale (French)
//   node --input-type=module-typescript - seed           the sample content: categories, articles, the homepage, media
//
// The verbs after `schema` talk to the running server, at STRAPI_SITE_URL, as
// the owner account of STRAPI_SITE_ACCOUNTS (base64 of a JSON object:
// { owner: {email, password}, accounts: [{handle, firstname, lastname, email,
// password, role}] }). The runners give it as a first line before this script
// on the standard input (`globalThis.STRAPI_SITE_ACCOUNTS = '<base64>';`), so
// it is in no command line a failed run prints; the variable of the same name
// in the environment works for a run by hand. The accounts never go into a
// file of the project.
//
// Everything here is the Community Edition: no Enterprise feature, no licence
// key, no cloud project. What the build writes into the app is marked with
// "Webship test site" in each file.
//
// TypeScript, with erasable syntax only, so nothing is built: Node.js runs it
// as it is (type stripping, from Node.js 22.18; on standard input it needs
// --input-type=module-typescript). `npm run lint` of the plugin type-checks it.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** An account as the functions of the plugin hand it over. */
interface Account {
  handle?: string;
  firstname?: string;
  lastname?: string;
  email: string;
  password: string;
  role?: string;
}

/** STRAPI_SITE_ACCOUNTS, decoded. */
interface AccountsInput {
  owner: Account | null;
  accounts: Account[];
}

/** What the script reads of the admin's API answers. */
interface ApiError {
  error?: { name?: string; message?: string; details?: Record<string, unknown> };
}

interface Role {
  id: number;
  code: string;
  name: string;
}

interface AdminUser {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  isActive?: boolean;
  roles?: Role[];
}

interface Locale {
  code: string;
}

interface Permission {
  action: string;
  subject: string | null;
  properties?: { locales?: string[]; [property: string]: unknown };
  conditions?: unknown[];
}

/** A document of the content manager. */
interface ContentDocument {
  id: number;
  documentId: string;
  [field: string]: unknown;
}

interface Folder {
  id: number;
  name: string;
}

interface MediaFile {
  id: number;
  name: string;
}

interface CallOptions {
  form?: boolean;
  allow?: number[];
}

interface Answer<T> {
  status: number;
  json: T;
  headers: Headers;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Colour = readonly [r: number, g: number, b: number];
type ArticleState = 'published' | 'draft' | 'modified';
type Article = readonly [title: string, category: string, state: ArticleState, featured: boolean];

const APP = process.cwd();
const BASE = (process.env.STRAPI_SITE_URL || 'http://127.0.0.1:1337').replace(/\/+$/, '');
const [verb, ...args] = process.argv.slice(2);

function payload(): AccountsInput {
  // The runners set it in a first line before this script (globalThis.STRAPI_SITE_ACCOUNTS = '<base64>';).
  const raw = (globalThis as { STRAPI_SITE_ACCOUNTS?: string }).STRAPI_SITE_ACCOUNTS || process.env.STRAPI_SITE_ACCOUNTS;
  if (!raw) return { owner: null, accounts: [] };
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as AccountsInput;
}

function write(rel: string, content: string | object): void {
  const file = path.join(APP, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// config: the address of the site, the proxy, telemetry
// ---------------------------------------------------------------------------

function config(url: string | undefined): void {
  if (!url) fail('config needs the address of the site: config https://<name>.ddev.site');
  // The router of the container tool ends TLS and sends the request on over
  // HTTP: the server trusts its X-Forwarded-* headers (proxy) and knows its
  // public address (url), so the admin's secure cookies and links are right.
  // The installer's own config/server.ts (or .js) gets two lines after `port`.
  const serverFile = ['config/server.ts', 'config/server.js'].map((f) => path.join(APP, f)).find((f) => fs.existsSync(f));
  if (!serverFile) fail('No config/server.ts or config/server.js in the app.');
  let server = fs.readFileSync(serverFile, 'utf8');
  server = server.replace(/\n[ \t]*\/\/ Webship test site: the address[^\n]*\n[^\n]*PUBLIC_URL[^\n]*\n[^\n]*IS_PROXIED[^\n]*/, '');
  const port = server.match(/^([ \t]*)port:[^\n]*$/m);
  if (!port) fail(`${path.basename(serverFile)} has no port line to add the address after.`);
  const lines = [
    `${port[1]}// Webship test site: the address of the site and the proxy in front of it.`,
    `${port[1]}url: env('PUBLIC_URL', '${url}'),`,
    `${port[1]}proxy: { koa: env.bool('IS_PROXIED', true) },`,
  ];
  const after = (port.index ?? 0) + port[0].length;
  server = server.slice(0, after) + '\n' + lines.join('\n') + server.slice(after);
  fs.writeFileSync(serverFile, server);
  // No survey pop-up in the admin (the Net Promoter Score survey): it would cover a screen in the middle of a test.
  const envFile = path.join(APP, '.env');
  let dotenv = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  if (!/^FLAG_NPS=/m.test(dotenv)) dotenv += (dotenv.endsWith('\n') || !dotenv ? '' : '\n') + '\n# Webship test site: no survey pop-up in the admin.\nFLAG_NPS=false\n';
  fs.writeFileSync(envFile, dotenv);
  // Telemetry off in the app itself too (the container sets STRAPI_TELEMETRY_DISABLED).
  const pkgFile = path.join(APP, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { strapi?: Record<string, unknown>; [key: string]: unknown };
  pkg.strapi = Object.assign({}, pkg.strapi, { telemetryDisabled: true });
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  // No release notification in the admin: it asks GitHub's API for the latest release on every page,
  // a request to the outside a test does not want, which GitHub answers 403 once its limit for the
  // address is reached. The admin's own customisation file says so; one the app already has is kept.
  const adminDir = path.join(APP, 'src/admin');
  const existing = ['tsx', 'ts', 'jsx', 'js'].map((e) => path.join(adminDir, `app.${e}`)).find((f) => fs.existsSync(f));
  let releases = 'no release notification';
  if (existing) {
    if (!fs.readFileSync(existing, 'utf8').includes('Webship test site')) releases = `the admin's own ${path.relative(APP, existing)} kept`;
  } else {
    const ext = fs.existsSync(path.join(APP, 'tsconfig.json')) ? 'tsx' : 'js';
    fs.mkdirSync(adminDir, { recursive: true });
    fs.writeFileSync(path.join(adminDir, `app.${ext}`), [
      '// Webship test site: no release notification in the admin (it asks GitHub\'s API on every page).',
      'export default {',
      '  config: {',
      '    notifications: { releases: false },',
      '  },',
      '  bootstrap() {},',
      '};',
      '',
    ].join('\n'));
  }
  console.log(`config: the site answers at ${url}, behind the proxy; telemetry off; no survey pop-up; ${releases}`);
}

// ---------------------------------------------------------------------------
// schema: the content model
// ---------------------------------------------------------------------------

const localized = { i18n: { localized: true } };
const shared = { i18n: { localized: false } };

function apiFiles(name: string, kind?: string): string | undefined {
  const uid = `api::${name}.${name}`;
  write(`src/api/${name}/routes/${name}.ts`, `// Webship test site.\nimport { factories } from '@strapi/strapi';\n\nexport default factories.createCoreRouter('${uid}');\n`);
  write(`src/api/${name}/controllers/${name}.ts`, `// Webship test site.\nimport { factories } from '@strapi/strapi';\n\nexport default factories.createCoreController('${uid}');\n`);
  write(`src/api/${name}/services/${name}.ts`, `// Webship test site.\nimport { factories } from '@strapi/strapi';\n\nexport default factories.createCoreService('${uid}');\n`);
  return kind;
}

function schema(): void {
  // Components: three for the article's dynamic zone, one for the homepage.
  write('src/components/shared/quote.json', {
    collectionName: 'components_shared_quotes',
    info: { displayName: 'Quote', icon: 'quote', description: 'Webship test site: a quotation and who said it' },
    options: {},
    attributes: {
      body: { type: 'text', required: true },
      author: { type: 'string' },
    },
  });
  write('src/components/shared/rich-text.json', {
    collectionName: 'components_shared_rich_texts',
    info: { displayName: 'Rich text', icon: 'align-justify', description: 'Webship test site: a passage in Markdown' },
    options: {},
    attributes: {
      body: { type: 'richtext' },
    },
  });
  write('src/components/shared/media.json', {
    collectionName: 'components_shared_media',
    info: { displayName: 'Media', icon: 'file-video', description: 'Webship test site: an image or a file' },
    options: {},
    attributes: {
      file: { type: 'media', multiple: false, required: false, allowedTypes: ['images', 'files', 'videos'] },
    },
  });
  write('src/components/shared/seo.json', {
    collectionName: 'components_shared_seos',
    info: { displayName: 'Seo', icon: 'search', description: 'Webship test site: the title and description search engines show' },
    options: {},
    attributes: {
      metaTitle: { type: 'string', required: true, maxLength: 60 },
      metaDescription: { type: 'text', maxLength: 160 },
    },
  });

  apiFiles('category');
  write('src/api/category/content-types/category/schema.json', {
    kind: 'collectionType',
    collectionName: 'categories',
    info: { singularName: 'category', pluralName: 'categories', displayName: 'Category', description: 'Webship test site: what an article is about' },
    options: { draftAndPublish: false },
    pluginOptions: {},
    attributes: {
      name: { type: 'string', required: true, unique: true },
      slug: { type: 'uid', targetField: 'name' },
      description: { type: 'text' },
      articles: { type: 'relation', relation: 'oneToMany', target: 'api::article.article', mappedBy: 'category' },
    },
  });

  apiFiles('article');
  write('src/api/article/content-types/article/schema.json', {
    kind: 'collectionType',
    collectionName: 'articles',
    info: { singularName: 'article', pluralName: 'articles', displayName: 'Article', description: 'Webship test site: news and stories' },
    options: { draftAndPublish: true },
    pluginOptions: localized,
    attributes: {
      title: { type: 'string', required: true, pluginOptions: localized },
      slug: { type: 'uid', targetField: 'title', pluginOptions: localized },
      summary: { type: 'text', maxLength: 280, pluginOptions: localized },
      content: { type: 'blocks', pluginOptions: localized },
      cover: { type: 'media', multiple: false, required: false, allowedTypes: ['images'], pluginOptions: shared },
      category: { type: 'relation', relation: 'manyToOne', target: 'api::category.category', inversedBy: 'articles' },
      featured: { type: 'boolean', default: false, pluginOptions: shared },
      blocks: { type: 'dynamiczone', components: ['shared.quote', 'shared.rich-text', 'shared.media'], pluginOptions: localized },
    },
  });

  apiFiles('homepage');
  write('src/api/homepage/content-types/homepage/schema.json', {
    kind: 'singleType',
    collectionName: 'homepages',
    info: { singularName: 'homepage', pluralName: 'homepages', displayName: 'Homepage', description: 'Webship test site: the front page of the site' },
    options: { draftAndPublish: true },
    pluginOptions: localized,
    attributes: {
      title: { type: 'string', required: true, pluginOptions: localized },
      intro: { type: 'text', pluginOptions: localized },
      seo: { type: 'component', repeatable: false, component: 'shared.seo', pluginOptions: localized },
    },
  });
  console.log('schema: Article, Category, Homepage, and the components Quote, Rich text, Media and Seo');
}

// ---------------------------------------------------------------------------
// The admin's API
// ---------------------------------------------------------------------------

let TOKEN: string | null = null;

// The answer's JSON is taken as the shape the caller names: the admin's own API, as its admin uses it.
async function call<T = unknown>(method: Method, url: string, body?: unknown, { form = false, allow = [] }: CallOptions = {}): Promise<Answer<T>> {
  const headers: Record<string, string> = {};
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  let data: string | FormData | undefined;
  if (form) {
    data = body as FormData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    data = JSON.stringify(body);
  }
  let response: Response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await fetch(BASE + url, { method, headers, body: data });
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      await new Promise<void>((resolve) => { setTimeout(resolve, 2000); });
    }
  }
  const text = await response.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!response.ok && !allow.includes(response.status)) {
    const failed = json as ApiError | null;
    const detail = failed && failed.error ? `${failed.error.name}: ${failed.error.message}${failed.error.details && Object.keys(failed.error.details).length ? ' ' + JSON.stringify(failed.error.details) : ''}` : text.slice(0, 300);
    throw new Error(`${method} ${url} answered ${response.status}: ${detail}`);
  }
  return { status: response.status, json: json as T, headers: response.headers };
}

async function logIn(): Promise<void> {
  // One login per run of this script: the admin allows 5 logins of an account
  // in 5 minutes (from one address), and every verb below needs the session.
  if (TOKEN) return;
  const { owner } = payload();
  if (!owner) fail('No owner account in STRAPI_SITE_ACCOUNTS.');
  const credentials = { email: owner.email, password: owner.password };
  let { status, json, headers } = await call<LoginAnswer | null>('POST', '/admin/login', credentials, { allow: [429] });
  if (status === 429) {
    // The admin's limit: 5 logins of an account in 5 minutes from one address. Wait once for its
    // window to end (the admin says when, in seconds since the epoch), then log in again.
    const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
    const wait = Math.min(Math.max((reset || Date.now() + 60000) - Date.now(), 0) + 1000, 6 * 60 * 1000);
    console.log(`The admin allows 5 logins of an account in 5 minutes: waiting ${Math.round(wait / 1000)} s for its limit to end.`);
    await new Promise<void>((resolve) => { setTimeout(resolve, wait); });
    ({ status, json, headers } = await call<LoginAnswer | null>('POST', '/admin/login', credentials));
  }
  TOKEN = (json && json.data && (json.data.token || json.data.accessToken)) || null;
  if (!TOKEN) fail(`The owner ${owner.email} could not log in: ${JSON.stringify(json)}`);
}

/** What the admin's login answers. */
interface LoginAnswer {
  data?: { token?: string; accessToken?: string };
}

async function roles(): Promise<Role[]> {
  const { json } = await call<{ data: Role[] }>('GET', '/admin/roles');
  return json.data;
}

async function adminUsers(): Promise<AdminUser[]> {
  const { json } = await call<{ data: { results: AdminUser[] } }>('GET', '/admin/users?pageSize=100&page=1');
  return json.data.results;
}

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

async function accounts(sub: string): Promise<void> {
  const { owner, accounts: wanted } = payload();
  if (sub === 'installed') {
    // Whether the owner can log in: the site has its first account.
    try { await logIn(); } catch { process.exit(1); }
    return;
  }
  await logIn();
  const allRoles = await roles();
  const roleId = (code: string | undefined): number => {
    const role = allRoles.find((r) => r.code === code || r.name === code);
    if (!role) fail(`No role "${code}" on the site; it has: ${allRoles.map((r) => `${r.name} (${r.code})`).join(', ')}`);
    return role.id;
  };
  const existing = await adminUsers();
  const byMail = (email: string): AdminUser | undefined => existing.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase());

  if (sub === 'list') {
    for (const user of existing) {
      console.log(`   ${user.email}  ${[user.firstname, user.lastname].filter(Boolean).join(' ')}  ${(user.roles || []).map((r) => r.name).join(', ')}  ${user.isActive ? 'active' : 'inactive'}`);
    }
    return;
  }
  if (sub === 'cancel') {
    for (const account of wanted) {
      if (owner && account.email.toLowerCase() === owner.email.toLowerCase()) continue;
      const user = byMail(account.email);
      if (!user) { console.log(`   ${account.email}: not on the site`); continue; }
      await call('DELETE', `/admin/users/${user.id}`);
      console.log(`   ${account.email}: deleted`);
    }
    return;
  }
  if (sub !== 'add') fail(`accounts takes add, cancel, list or installed, not ${sub}`);
  for (const account of wanted) {
    const body = {
      firstname: account.firstname,
      lastname: account.lastname,
      email: account.email,
      roles: [roleId(account.role)],
    };
    let user = byMail(account.email);
    if (!user) {
      const { json } = await call<{ data: AdminUser }>('POST', '/admin/users', body);
      user = json.data;
    }
    await call('PUT', `/admin/users/${user.id}`, { ...body, password: account.password, isActive: true });
    console.log(`   ${account.email}: ${account.firstname} ${account.lastname}, ${allRoles.find((r) => r.id === body.roles[0])?.name}, active`);
  }
}

// ---------------------------------------------------------------------------
// locales
// ---------------------------------------------------------------------------

async function locales(): Promise<void> {
  await logIn();
  const { json } = await call<Locale[] | { data?: Locale[] } | null>('GET', '/i18n/locales');
  const list: Locale[] = Array.isArray(json) ? json : (json && json.data) || [];
  if (!list.some((l) => l.code === 'fr')) {
    await call('POST', '/i18n/locales', { code: 'fr', name: 'French (fr)', isDefault: false });
  }
  // A role's permissions on a localised content type name their locales: the
  // Editor and Author roles were made with English only, when the app first
  // started. They get French too, as an administrator gives it in Settings >
  // Roles. The Super Admin has every locale already.
  const codes = ['en', 'fr'];
  for (const role of await roles()) {
    if (role.code === 'strapi-super-admin') continue;
    const { json: current } = await call<{ data: Permission[] }>('GET', `/admin/roles/${role.id}/permissions`);
    let changed = false;
    const permissions = current.data.map((permission) => {
      const properties: NonNullable<Permission['properties']> = Object.assign({}, permission.properties);
      if (Array.isArray(properties.locales)) {
        const merged = [...new Set([...properties.locales, ...codes])];
        if (merged.length !== properties.locales.length) changed = true;
        properties.locales = merged;
      }
      return { action: permission.action, subject: permission.subject, properties, conditions: permission.conditions || [] };
    });
    if (changed) await call('PUT', `/admin/roles/${role.id}/permissions`, { permissions });
  }
  console.log('locales: English (en, the default) and French (fr), both granted to every role');
}

// ---------------------------------------------------------------------------
// seed: the sample content
// ---------------------------------------------------------------------------

// A plain PNG of one colour with a darker band, made here so the build needs no
// image files: width x height, RGB.
function png(width: number, height: number, [r, g, b]: Colour): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    const dark = y > height * 0.6 && y < height * 0.75;
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = dark ? r >> 1 : r;
      row[2 + x * 3] = dark ? g >> 1 : g;
      row[3 + x * 3] = dark ? b >> 1 : b;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CATEGORIES = [
  { name: 'News', description: 'What happened, as it happened.' },
  { name: 'Guides', description: 'How to do things, step by step.' },
  { name: 'Events', description: 'Where to be, and when.' },
  { name: 'Opinion', description: 'What our writers think.' },
];

// 24 articles: 3 pages of 10 in the list. "river" is in three titles, "harbour"
// in two; the states are mixed: published, draft, and published then changed
// ("Modified"). Five have a French version.
const ARTICLES: readonly Article[] = [
  ['Harbour lights at dusk', 'News', 'published', true],
  ['A guide to river walks', 'Guides', 'published', false],
  ['The river festival returns', 'Events', 'published', true],
  ['Why the old bridge matters', 'Opinion', 'published', false],
  ['Market day in the square', 'News', 'draft', false],
  ['Planting a city garden', 'Guides', 'published', false],
  ['Night of the open museums', 'Events', 'modified', false],
  ['Slow travel, by train', 'Opinion', 'published', false],
  ['New ferry times for winter', 'News', 'published', false],
  ['How to read a tide table', 'Guides', 'draft', false],
  ['The harbour run, ten kilometres', 'Events', 'published', false],
  ['In praise of public libraries', 'Opinion', 'modified', false],
  ['Cycle lanes open on the east side', 'News', 'published', false],
  ['Baking bread at home', 'Guides', 'published', false],
  ['Autumn concerts in the park', 'Events', 'draft', false],
  ['A city that walks', 'Opinion', 'published', false],
  ['Library hours change in spring', 'News', 'published', false],
  ['Mending a bicycle puncture', 'Guides', 'published', false],
  ['Lantern parade along the river', 'Events', 'published', false],
  ['Quiet streets, better sleep', 'Opinion', 'draft', false],
  ['School gardens win an award', 'News', 'published', false],
  ['Choosing walking boots', 'Guides', 'modified', false],
  ['The winter book fair', 'Events', 'published', false],
  ['Keep the corner shops', 'Opinion', 'published', false],
];
const FRENCH: Record<string, string> = {
  'Harbour lights at dusk': 'Lumières du port au crépuscule',
  'A guide to river walks': 'Guide des promenades au bord de la rivière',
  'The river festival returns': 'Le festival de la rivière revient',
  'Slow travel, by train': 'Voyager lentement, en train',
  'Baking bread at home': 'Faire son pain à la maison',
};

function slugify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function paragraph(text: string): object[] {
  return [{ type: 'paragraph', children: [{ type: 'text', text }] }];
}

const CM = '/content-manager';

async function findDocuments(uid: string, filter?: string): Promise<ContentDocument[]> {
  const params = new URLSearchParams({ page: '1', pageSize: '100' });
  if (filter) params.set('_q', filter);
  const { json } = await call<{ results?: ContentDocument[] }>('GET', `${CM}/collection-types/${uid}?${params}`);
  return json.results || [];
}

async function upload(name: string, buffer: Buffer, folder: number | null, alternativeText: string): Promise<MediaFile> {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), name);
  form.append('fileInfo', JSON.stringify({ name, alternativeText, caption: '', folder: folder || null }));
  const { json } = await call<MediaFile[] | MediaFile>('POST', '/upload', form, { form: true });
  const file = Array.isArray(json) ? json[0] : json;
  if (!file) throw new Error(`POST /upload answered no file for ${name}.`);
  return file;
}

async function seed(): Promise<void> {
  await logIn();

  // Media: three images at the root of the Media Library, two more in the
  // folder "Covers" (the articles' covers).
  const { json: folderList } = await call<{ data?: Folder[] } | null>('GET', '/upload/folders?pagination[pageSize]=100');
  const folders: Folder[] = (folderList && folderList.data) || [];
  let covers = folders.find((f) => f.name === 'Covers');
  if (!covers) covers = (await call<{ data: Folder }>('POST', '/upload/folders', { name: 'Covers', parent: null })).json.data;
  const { json: fileList } = await call<MediaFile[] | { results?: MediaFile[]; data?: MediaFile[] } | null>('GET', '/upload/files?pageSize=100');
  const files = (fileList && (Array.isArray(fileList) ? fileList : fileList.results || fileList.data || fileList)) || [];
  const media: Record<string, MediaFile> = {};
  const mediaId = (name: string): number => {
    const file = media[name];
    if (!file) throw new Error(`The image ${name} is not in the Media Library.`);
    return file.id;
  };
  const wantedMedia: readonly (readonly [name: string, colour: Colour, folder: number | null, alt: string])[] = [
    ['mountains.png', [96, 140, 196], null, 'Blue mountains under a pale sky'],
    ['meadow.png', [104, 170, 96], null, 'A green meadow'],
    ['sunset.png', [224, 132, 72], null, 'An orange sunset'],
    ['harbour-cover.png', [52, 96, 148], covers.id, 'Boats in a harbour at dusk'],
    ['river-cover.png', [64, 150, 160], covers.id, 'A river between trees'],
  ];
  for (const [name, colour, folder, alt] of wantedMedia) {
    const found = Array.isArray(files) ? files.find((f) => f.name === name) : null;
    media[name] = found || await upload(name, png(640, 400, colour), folder, alt);
  }

  // Categories.
  const categories: Record<string, ContentDocument> = {};
  for (const category of CATEGORIES) {
    const found = (await findDocuments('api::category.category', category.name)).find((c) => c.name === category.name);
    if (found) { categories[category.name] = found; continue; }
    const { json } = await call<{ data: ContentDocument }>('POST', `${CM}/collection-types/api::category.category`, { name: category.name, slug: slugify(category.name), description: category.description });
    categories[category.name] = json.data;
  }

  // Articles.
  const uid = 'api::article.article';
  for (const [title, category, state, featured] of ARTICLES) {
    const existing = (await findDocuments(uid, title)).find((a) => a.title === title);
    if (existing) continue;
    const data = {
      title,
      slug: slugify(title),
      summary: `${title}: a short summary for the list.`,
      content: paragraph(`${title}. A sample article of the test site.`),
      category: { connect: [{ documentId: categories[category]?.documentId }] },
      featured,
      cover: /harbour/i.test(title) ? mediaId('harbour-cover.png') : /river/i.test(title) ? mediaId('river-cover.png') : null,
      blocks: title === 'Harbour lights at dusk' ? [
        { __component: 'shared.quote', body: 'The harbour is never darker than at the moment the lights come on.', author: 'A harbour master' },
        { __component: 'shared.rich-text', body: 'The lights come on **one by one**, from the lighthouse to the market.' },
        { __component: 'shared.media', file: mediaId('harbour-cover.png') },
      ] : [],
    };
    const { json } = await call<{ data: ContentDocument }>('POST', `${CM}/collection-types/${uid}?locale=en`, data);
    const doc = json.data;
    if (state === 'published' || state === 'modified') {
      await call('POST', `${CM}/collection-types/${uid}/${doc.documentId}/actions/publish?locale=en`, {});
    }
    if (state === 'modified') {
      await call('PUT', `${CM}/collection-types/${uid}/${doc.documentId}?locale=en`, { summary: `${title}: a short summary, changed after it was published.` });
    }
    const fr = FRENCH[title];
    if (fr) {
      await call('PUT', `${CM}/collection-types/${uid}/${doc.documentId}?locale=fr`, {
        title: fr,
        slug: slugify(fr),
        summary: `${fr} : un court résumé pour la liste.`,
        content: paragraph(`${fr}. Un article d'exemple du site de test.`),
        blocks: [],
      });
      if (state === 'published') {
        await call('POST', `${CM}/collection-types/${uid}/${doc.documentId}/actions/publish?locale=fr`, {});
      }
    }
  }

  // The homepage, in English and French, published.
  const home = 'api::homepage.homepage';
  await call('PUT', `${CM}/single-types/${home}?locale=en`, {
    title: 'Welcome to the city',
    intro: 'News, guides and events from around the city.',
    seo: { metaTitle: 'Welcome to the city', metaDescription: 'News, guides and events from around the city.' },
  });
  await call('POST', `${CM}/single-types/${home}/actions/publish?locale=en`, {});
  await call('PUT', `${CM}/single-types/${home}?locale=fr`, {
    title: 'Bienvenue en ville',
    intro: 'Les nouvelles, les guides et les événements de la ville.',
    seo: { metaTitle: 'Bienvenue en ville', metaDescription: 'Les nouvelles, les guides et les événements de la ville.' },
  });
  await call('POST', `${CM}/single-types/${home}/actions/publish?locale=fr`, {});

  console.log(`seed: ${CATEGORIES.length} categories, ${ARTICLES.length} articles (${Object.keys(FRENCH).length} in French too), the homepage in two locales, ${wantedMedia.length} images (2 in the folder "Covers")`);
}

// ---------------------------------------------------------------------------

// Several verbs may follow each other in one call (`accounts add locales seed`):
// they share one login.
try {
  const words = [verb, ...args];
  if (!verb) fail('strapi-site.mts takes config <url>, schema, accounts <add|cancel|list|installed>, locales or seed.');
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? '';
    if (word === 'config') { config(words[i + 1]); i += 1; }
    else if (word === 'schema') schema();
    else if (word === 'accounts') { await accounts(words[i + 1] || 'add'); i += 1; }
    else if (word === 'locales') await locales();
    else if (word === 'seed') await seed();
    else fail(`strapi-site.mts takes config <url>, schema, accounts <add|cancel|list|installed>, locales or seed, not ${word}`);
  }
} catch (err: unknown) {
  fail(err instanceof Error && err.message ? err.message : String(err));
}
