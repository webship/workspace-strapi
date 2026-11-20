/**
 * Strapi for Webship Workspace: a platform plugin.
 *
 * What the package carries is placed by the installer from the manifest: the builder and the Strapi
 * CLI tool in the sites folders, their functions and argparse under core/scripts/plugins/strapi/ (with
 * strapi-site.mjs, which the builder runs with the app's Node.js), and its AI items (ai/ in this
 * package) in the folder of their kind: the agents in AI Agents, the skill in AI Skills, the command in
 * AI Commands, the prompts in AI Prompts. The dashboard needs nothing drawn for it: the builder is in
 * the Build list because it is a cmd-*-project.sh, the row menus are the core's, the AI items are
 * listed like any other. What register() adds is what the assistant is told.
 *
 * Everything the dashboard is asked for goes through `api`; this package requires nothing from the
 * dashboard's own files, so it can be installed from npm and removed without a trace.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';

/** The plugin's name. A Strapi app is a generic DDEV project: the plugin knows it by .ddev/config.strapi.yaml. */
export const PLATFORM = 'strapi';

/** The commands the installer places in every sites folder. */
export const COMMANDS = ['cmd-strapi-project.sh', 'cmd-tools-strapi-cli.sh'];

/** The agents the installer places in the AI Agents folder. */
export const AGENTS = ['strapi-site-builder', 'strapi-tester'];

/** The skill the installer places in the AI Skills folder (a folder each, with its SKILL.md). */
export const SKILLS = ['strapi-scenarios'];

/** The slash command the installer places in the AI Commands folder. */
export const AI_COMMANDS = ['strapi-test'];

/** The prompts the installer places in the AI Prompts folder: each a whole launch command for a new session. */
export const PROMPTS = ['strapi-build-and-test', 'strapi-scenarios-for-an-area'];

/** What the assistant is told about Strapi in this workspace. */
export function assistantContext(): string {
  return [
    'Strapi (a plugin, @webship.co/workspace-strapi): an app is built with',
    '`bash cmd-strapi-project.sh <name> --install --add-users --sample-content` from a sites folder (dev, test, sandboxes, demos):',
    'an app made with the official installer (create-strapi, the Community Edition, no cloud login, telemetry off), on PostgreSQL,',
    'with `--sample-content` a content model (articles, categories, a homepage, components, a dynamic zone, English and French) and its sample content,',
    'in a container like every other project (a generic DDEV project, Node.js 24 in the web image, the server in production as a daemon), its admin at https://<name>.ddev.site/admin.',
    '`bash cmd-tools-strapi-cli.sh <name>` says what the app is; `--run "<command> <args>"` runs a Strapi CLI command in it,',
    '`--build` builds the app and its admin again, `--update` updates Strapi within its major release, `--restart` starts the server again,',
    '`--add-users` adds the default accounts (administrator, editor, author; the admin logs in with their email addresses) and `--cancel-users` deletes them.',
    'The row\'s Users menu does not apply to a Strapi app (its project type is generic): use the Strapi CLI tool for the accounts.',
    '`bash cmd-tools-testing.sh <name>` sets up webship-js with the Strapi step pack; `--run` runs the suite.',
    `For Strapi work, hand over to the agents ${AGENTS.map((a) => `\`${a}\``).join(' and ')}.`,
    `The plugin also places the skill ${SKILLS.map((a) => `\`${a}\``).join(', ')} (the step pack's phrases, by area) in ai-skills/,`,
    `the command ${AI_COMMANDS.map((a) => `\`/${a} <site>\``).join(', ')} in ai-commands/ and the prompts ${PROMPTS.map((a) => `\`${a}\``).join(' and ')} in ai-prompts/.`,
    'Never run node, npm or the Strapi CLI on the host for a project; the database settings in its .env are the container\'s own (db, db, db).',
  ].join(' ');
}

export function register(api: PluginApi): void {
  api.addAssistantContext(assistantContext);
}
