import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const FUNCTIONS = path.join(PKG, 'scripts', 'functions', 'fun-strapi.sh');

// The cucumber.js webship-js scaffolds, as far as the testing hook reads it.
const SCAFFOLD = `module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',          // Webship-js core step definitions.
      'tests/step-definitions/**/*.js',                                  // Your custom step definitions.
    ],
    paths: ['tests/features/**/*.feature'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'http://localhost:8080',
    },
  },
};
`;

/**
 * A project folder with the testing stack scaffolded, and the tooling folder the installer would have filled.
 * A Strapi project of this plugin has the builder's .ddev/config.strapi.yaml.
 */
function project(kind: 'strapi' | 'drupal') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strapi-plugin-'));
  const dir = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(dir, '.ddev'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ddev', 'config.yaml'), `name: site1\ntype: ${kind === 'strapi' ? 'generic' : 'drupal11'}\n`);
  if (kind === 'strapi') fs.writeFileSync(path.join(dir, '.ddev', 'config.strapi.yaml'), 'web_extra_daemons: []\n');
  fs.writeFileSync(path.join(dir, 'cucumber.js'), SCAFFOLD);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'site1', devDependencies: { 'webship-js': '^2.0.6' } }, null, 2));
  const scripts = path.join(root, 'core', 'scripts');
  fs.mkdirSync(path.join(scripts, 'plugins', 'strapi'), { recursive: true });
  fs.copyFileSync(path.join(PKG, 'testing', 'site.feature'), path.join(scripts, 'plugins', 'strapi', 'site.feature'));
  fs.copyFileSync(path.join(PKG, 'scripts', 'strapi-site.mts'), path.join(scripts, 'plugins', 'strapi', 'strapi-site.mts'));
  return { root, dir, scripts };
}

/**
 * Run bash with the plugin's functions sourced and `ddev` replaced by a recorder of its calls and of what it
 * reads on stdin: the first line whole (`stdin1:`), then the start of the rest (`stdin:`).
 */
function bash(script: string, env: Record<string, string> = {}) {
  const fake = 'ddev() { echo "ddev $*" >> "${DDEV_LOG:-/dev/null}" ; if [ ! -t 0 ] ; then IFS= read -r first ; echo "  stdin1: ${first}" >> "${DDEV_LOG:-/dev/null}" ; head -c 120 | sed "s/^/  stdin: /" >> "${DDEV_LOG:-/dev/null}" ; echo >> "${DDEV_LOG:-/dev/null}" ; fi ; return 0 ; }';
  return spawnSync('bash', ['-c', `${fake}\nsource ${FUNCTIONS}\n${script}`], { encoding: 'utf8', env: { ...process.env, ...env } });
}

/**
 * The accounts a recorded call of strapi-site.mts carried: the base64 of their JSON object, on the first line of
 * its standard input, before the script, and never on its command line (a failed run prints that).
 */
function payloadOf(recorded: string) {
  const lines = recorded.split('\n');
  const call = lines.findIndex((l) => l.startsWith('ddev exec -d /var/www/html/app'));
  assert.ok(call >= 0, `a call of the site script: ${recorded}`);
  assert.doesNotMatch(lines[call], /STRAPI_SITE_ACCOUNTS/, 'no account on the command line');
  const m = (lines[call + 1] || '').match(/^  stdin1: globalThis\.STRAPI_SITE_ACCOUNTS = '([A-Za-z0-9+\/=]+)';$/);
  assert.ok(m, `the first line of its input carries the accounts: ${lines[call + 1]}`);
  return JSON.parse(Buffer.from(m![1], 'base64').toString('utf8'));
}

test('the default accounts are a Super Admin, an editor and an author, with example addresses', () => {
  const r = bash('set_strapi_users ; for u in "${users[@]}" ; do n="user_${u}_name" ; m="user_${u}_mail" ; p="user_${u}_password" ; g="user_${u}_role" ; echo "${!n}|${!m}|${!p}|${!g}" ; done');
  assert.strictEqual(r.status, 0, r.stderr);
  const rows = r.stdout.trim().split('\n').map((l) => l.split('|'));
  assert.deepStrictEqual(rows.map((x) => x[0]), ['administrator', 'editor', 'author']);
  assert.deepStrictEqual(rows.map((x) => x[3]), ['strapi-super-admin', 'strapi-editor', 'strapi-author']);
  for (const [name, mail, password] of rows) {
    assert.strictEqual(mail, `${name}@example.com`);
    // The admin's rules: 8 characters or more, a capital, a small letter and a number.
    assert.ok(password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), 'the password the admin accepts');
  }
});

test('the accounts are written by the site script with the app\'s Node.js, in the folder of the app, never in a file', () => {
  const p = project('strapi');
  const log = path.join(p.root, 'ddev.log');
  const env = { WORKSPACE_ROOT: p.root, WORKSPACE_SCRIPTS: p.scripts, doc_name: 'dev', PROJECT_NAME: 'site1', DDEV_LOG: log, account_name: 'owner1', account_mail: 'owner1@example.com', account_pass: 'Owner-pass-1' };
  const r = bash('set_strapi_users ; add_strapi_users', env);
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const written = fs.readFileSync(log, 'utf8');
  const call = written.split('\n').find((l) => l.startsWith('ddev exec -d /var/www/html/app')) as string;
  assert.match(call, /node --input-type=module-typescript - accounts add$/);
  assert.match(call, /STRAPI_SITE_URL=http:\/\/127\.0\.0\.1:1337 /, 'the script talks to the server in the container');
  assert.match(written, /stdin: \/\/ The test site of the step pack/, 'the script goes in on stdin');
  const payload = payloadOf(written);
  assert.deepStrictEqual(payload.accounts.map((a: any) => [a.handle, a.email, a.role]), [
    ['administrator', 'administrator@example.com', 'strapi-super-admin'],
    ['editor', 'editor@example.com', 'strapi-editor'],
    ['author', 'author@example.com', 'strapi-author'],
  ]);
  assert.deepStrictEqual(payload.accounts.map((a: any) => a.firstname), ['Administrator', 'Editor', 'Author']);
  assert.strictEqual(payload.owner.email, 'owner1@example.com', 'the workspace account logs in to add them');
  assert.deepStrictEqual(fs.readdirSync(p.dir).filter((f) => !['.ddev', 'cucumber.js', 'package.json'].includes(f)), [], 'no file with a password is left in the project');
});

test('cancelling the accounts deletes the default ones through the site script', () => {
  const p = project('strapi');
  const log = path.join(p.root, 'ddev.log');
  const r = bash('set_strapi_users ; cancel_strapi_users', { WORKSPACE_ROOT: p.root, WORKSPACE_SCRIPTS: p.scripts, doc_name: 'dev', PROJECT_NAME: 'site1', DDEV_LOG: log, account_name: 'owner1', account_mail: 'owner1@example.com', account_pass: 'x' });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const recorded = fs.readFileSync(log, 'utf8');
  assert.ok(recorded.split('\n').find((l) => l.includes(' - accounts cancel')), 'the cancel verb is called');
  assert.deepStrictEqual(payloadOf(recorded).accounts.map((a: any) => a.handle), ['administrator', 'editor', 'author']);
});

test('the builder refuses a --strapi-version that is not a release, and --add-users without --install, before it changes anything', () => {
  const p = project('strapi');
  const log = path.join(p.root, 'ddev.log');
  const base = { WORKSPACE_ROOT: p.root, WORKSPACE_SCRIPTS: p.scripts, doc_name: 'dev', DDEV_LOG: log };
  const odd = bash('PROJECT_NAME=site1 ; STRAPI_VERSION="beta" ; trim_project_name() { :; } ; drop_database() { echo dropped ; } ; strapi_build', base);
  assert.strictEqual(odd.status, 1);
  assert.match(odd.stdout, /--strapi-version takes a release \(5\.63\.0\), a major release \(5\) or latest, not beta\. Nothing was changed\./);
  const users = bash('PROJECT_NAME=site1 ; ADD_USERS=yes ; INSTALL=no ; trim_project_name() { :; } ; drop_database() { echo dropped ; } ; strapi_build', base);
  assert.strictEqual(users.status, 1);
  assert.match(users.stdout, /--add-users needs --install/);
  assert.doesNotMatch(odd.stdout + users.stdout, /dropped/, 'nothing was deleted');
  assert.ok(!fs.existsSync(log), 'the container tool was never called');
});

test('the builder writes the container\'s files: the server in production as a daemon behind the router, telemetry off, Node.js in the image', () => {
  const p = project('strapi');
  const r = bash(`strapi_write_ddev_config ${p.dir} 24`);
  assert.strictEqual(r.status, 0, r.stderr);
  const config = fs.readFileSync(path.join(p.dir, '.ddev', 'config.strapi.yaml'), 'utf8');
  assert.match(config, /container_port: 1337\n\s+http_port: 80\n\s+https_port: 443/);
  assert.match(config, /export NODE_ENV=production && exec \.\/node_modules\/\.bin\/strapi start/);
  assert.match(config, /STRAPI_TELEMETRY_DISABLED=true/);
  const docker = fs.readFileSync(path.join(p.dir, '.ddev', 'web-build', 'Dockerfile.strapi'), 'utf8');
  assert.match(docker, /N_PREFIX=\/usr\/local n install 24/);
});

test('the testing hook adds the step pack, the users registry, the admin\'s settings, the tags and a first feature, once', () => {
  const p = project('strapi');
  const log = path.join(p.root, 'ddev.log');
  const run = () => bash(`cd ${p.dir} && testing_configure_strapi ${p.dir}`, { WORKSPACE_ROOT: p.root, WORKSPACE_SCRIPTS: p.scripts, doc_name: 'dev', PROJECT_NAME: 'site1', DDEV_LOG: log, account_name: 'owner1', account_mail: 'owner1@example.com', account_pass: 'x' });
  const r = run();
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const pkg = JSON.parse(fs.readFileSync(path.join(p.dir, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.devDependencies['@webship-js/strapi-steps'], '^2.0.0');
  assert.strictEqual(pkg.devDependencies['webship-js'], '^2.0.6', 'what was there stays');
  const cucumber = fs.readFileSync(path.join(p.dir, 'cucumber.js'), 'utf8');
  const lines = cucumber.split('\n');
  const core = lines.findIndex((l) => l.includes('node_modules/webship-js/tests/step-definitions'));
  assert.strictEqual(lines[core + 1], "      'node_modules/@webship-js/strapi-steps/tests/step-definitions/**/*.js',", 'the pack is listed right after webship-js');
  assert.match(cucumber, /administrator: \{ email: process\.env\.STRAPI_ADMINISTRATOR_EMAIL \|\| 'administrator@example\.com', password: process\.env\.STRAPI_ADMINISTRATOR_PASSWORD \|\| '[^']+' \},/);
  assert.match(cucumber, /author: \{ email: process\.env\.STRAPI_AUTHOR_EMAIL \|\| 'author@example\.com'/);
  assert.match(cucumber, /dataAdmin: process\.env\.DATA_ADMIN \|\| 'administrator',/);
  assert.match(cucumber, /adminPath: process\.env\.ADMIN_PATH \|\| '\/admin',/);
  assert.match(cucumber, /tags: process\.env\.CUCUMBER_TAGS \|\| 'not @wip and not @must-fail',/);
  assert.match(cucumber, /ignore: 'the server responded with a status of 40\[14\]\|net::ERR_NETWORK_CHANGED'/);
  // Still a module node can load, with the registry where webship-js reads it.
  const loaded = spawnSync(process.execPath, ['-e', `const c = require(${JSON.stringify(path.join(p.dir, 'cucumber.js'))}).default; console.log(JSON.stringify([c.require, Object.keys(c.worldParameters.users), c.tags, c.worldParameters.dataAdmin, c.worldParameters.users.editor.email, c.worldParameters.javascript.mode]))`], { encoding: 'utf8', env: { ...process.env, CUCUMBER_TAGS: '' } });
  assert.strictEqual(loaded.status, 0, loaded.stderr);
  const [requires, handles, tags, admin, email, mode] = JSON.parse(loaded.stdout);
  assert.strictEqual(requires.length, 3);
  assert.deepStrictEqual(handles, ['administrator', 'editor', 'author']);
  assert.match(tags, /not @must-fail/);
  assert.strictEqual(admin, 'administrator');
  assert.strictEqual(email, 'editor@example.com');
  assert.strictEqual(mode, 'warn');
  assert.ok(fs.existsSync(path.join(p.dir, 'tests', 'features', 'site.feature')));
  assert.match(fs.readFileSync(log, 'utf8'), / - accounts add$/m, 'an app with its Super Admin gets the default accounts');
  // Again, after a person changed the feature: nothing is doubled, nothing is reset.
  fs.writeFileSync(path.join(p.dir, 'tests', 'features', 'site.feature'), 'Feature: mine\n');
  assert.strictEqual(run().status, 0);
  assert.strictEqual(fs.readFileSync(path.join(p.dir, 'cucumber.js'), 'utf8'), cucumber);
  assert.strictEqual(fs.readFileSync(path.join(p.dir, 'tests', 'features', 'site.feature'), 'utf8'), 'Feature: mine\n');
});

test('the testing hook leaves a project of another platform alone', () => {
  const p = project('drupal');
  const r = bash(`cd ${p.dir} && testing_configure_strapi ${p.dir}`, { WORKSPACE_ROOT: p.root, WORKSPACE_SCRIPTS: p.scripts, doc_name: 'dev', PROJECT_NAME: 'site1' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(fs.readFileSync(path.join(p.dir, 'cucumber.js'), 'utf8'), SCAFFOLD);
  assert.ok(!fs.existsSync(path.join(p.dir, 'tests')));
});

test('the CLI tool refuses a project that is not a Strapi app of the plugin', () => {
  const p = project('drupal');
  const r = bash('PROJECT_NAME=site1 ; RUN="version" ; trim_project_name() { :; } ; strapi_cli_tool', { WORKSPACE_ROOT: p.root, doc_name: 'dev' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /is not a Strapi project of this plugin/);
});

/** The CLI tool with --update, on a container tool that answers the upgrade tool's command as `upgrade` says. */
function update(upgrade: string) {
  const p = project('strapi');
  const fake = `ddev() {
    case "$*" in
      describe*) echo '{"raw":{"status":"running"}}' ;;
      *@strapi/upgrade*) ${upgrade} ;;
      *) echo "ddev $*" >> "${path.join(p.root, 'calls.log')}" ;;
    esac
  }`;
  const r = bash(`${fake}\nPROJECT_NAME=site1 ; RUN=_none_ ; BUILD=no ; RESTART=no ; ADD_USERS=no ; CANCEL_USERS=no ; UPDATE=yes ; trim_project_name() { :; } ; strapi_version() { echo 5.63.0 ; } ; strapi_cli_tool`, { WORKSPACE_ROOT: p.root, doc_name: 'dev' });
  const calls = fs.existsSync(path.join(p.root, 'calls.log')) ? fs.readFileSync(path.join(p.root, 'calls.log'), 'utf8') : '';
  return { r, calls };
}

test('--update on an app already on the latest release of its major release has nothing to do, and says so', () => {
  const { r, calls } = update(`echo '[ERROR] The project is already up-to-date (minor)' ; return 1`);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /already up-to-date \(minor\)/, 'the tool\'s own answer stays on screen');
  assert.match(r.stdout, /Strapi 5\.63\.0 is the latest release of its major release: nothing to update\./);
  assert.doesNotMatch(calls, /npm run build|supervisorctl/, 'no build and no restart');
});

test('--update stops when the upgrade tool fails for another reason', () => {
  const { r, calls } = update(`echo '[ERROR] Something else went wrong' ; return 1`);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /Something else went wrong/);
  assert.doesNotMatch(r.stdout, /nothing to update/);
  assert.doesNotMatch(calls, /npm run build/);
});

test('the first feature names no platform in a step, and no password', () => {
  const feature = fs.readFileSync(path.join(PKG, 'testing', 'site.feature'), 'utf8');
  const steps = feature.split('\n').filter((l) => /^\s*(Given|When|Then|And|But) /.test(l));
  assert.ok(steps.length >= 10);
  for (const s of steps) assert.doesNotMatch(s, /strapi|node\.?js/i, s);
  assert.doesNotMatch(feature, /dD\.123123ddd/);
  assert.doesNotMatch(feature, /admin:create-user|Invite new user/i, 'a suite never creates an account');
});
