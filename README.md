# @webship.co/workspace-strapi

Strapi for the [Webship Workspace](https://github.com/webship/workspace) dashboard: a builder that
makes a real Strapi app in a container (made with the official installer, `create-strapi`, the
Community Edition, on PostgreSQL, with a content model and its sample content on request), a Strapi
CLI tool for the apps it built, the default accounts, the [Strapi step pack](https://github.com/webship/strapi-steps)
wired into the workspace's testing setup, and its AI items — two agents, a skill, a command and two
prompts — each listed in the workspace folder of its kind.

The workspace is container-based (DDEV by default): a Strapi app is a row like any other, so the row
menus the core draws (start, stop, launch, backup, clone, remove, tests) work on it unchanged. The
row's Users menu does not apply to a Strapi app: see [The default accounts](#the-default-accounts).

It is made from the reference platform plugin, `@webship.co/workspace-wordpress`, and runs its apps
the way the Gatsby and Django plugins run theirs: a generic project, the language in the web image,
the server as a daemon.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require @webship.co/workspace-strapi --with-needs   # npm install into the dashboard
bash core/scripts/plugins.sh --activate strapi --with-needs                         # plugins.strapi in settings.yml
bash core/scripts/plugins.sh --install strapi                                       # commands, functions, args, AI items
bash core/scripts/plugins.sh --configure strapi                                     # nothing to configure: it has no settings file
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page. `--install` is
idempotent. `--uninstall` removes what it placed; an AI item you edited stays.

Everything the plugin carries lands in the folder it belongs to, when that folder is an active
workspace folder:

| What | Lands in |
| --- | --- |
| `cmd-strapi-project.sh`, `cmd-tools-strapi-cli.sh` | every active sites folder: `dev/`, `test/`, `sandboxes/`, `demos/` |
| The agents `strapi-site-builder`, `strapi-tester` | `ai-agents/` |
| The skill `strapi-scenarios` | `ai-skills/` |
| The command `/strapi-test` | `ai-commands/` |
| The prompts `strapi-build-and-test`, `strapi-scenarios-for-an-area` | `ai-prompts/` |

There they are listed like any other item of the folder, and installed into Claude Code from there.

## What it needs

A workspace starts empty, so the manifest says what else this plugin needs (`needs`):

- one sites folder, for the builder and the tool: `dev`, `test`, `sandboxes`, `demos` (`dev` is the one added when none is there). The folder also carries `cmd-tools-testing.sh` and the Users tools this plugin's hooks answer to.
- `ai-agents`, `ai-skills`, `ai-commands` and `ai-prompts`: the AI folders its agents, its skill, its command and its prompts are placed in.

`--require` says so, `--activate` and `--install` stop until the workspace has them, and `--with-needs` adds what is missing first:

```bash
bash core/scripts/plugins.sh --activate strapi --with-needs   # dev and the four AI folders are required, activated and installed first
bash core/scripts/plugins.sh --install strapi
```

Everything the builder runs for an app runs in the app's own container, through the container tool the workspace already needs: Node.js, npm, the installer and the Strapi CLI are the web container's. The plugin asks for no command of its own on the machine.

## What the package holds

| Path | What it is |
| --- | --- |
| `commands/cmd-strapi-project.sh` | The builder, in the Build list as **Strapi (create-strapi, PostgreSQL)**, installed into every sites folder |
| `commands/cmd-tools-strapi-cli.sh` | The Strapi CLI for one app: what the app is, a command, a new build, an update within its major release, a restart, the default accounts |
| `scripts/functions/fun-strapi.sh` | The bash functions behind both, sourced by bootstrap once installed; the names the core's tools look for (`set_strapi_users`, `add_strapi_users`, `cancel_strapi_users`, `testing_configure_strapi`) |
| `scripts/args/arg-strapi.sh`, `arg-strapi-cli.sh` | Their argparse; the Build form draws the builder's flags from the first |
| `scripts/strapi-site.mjs` | Run with the app's Node.js in the project's container: the address of the app and its proxy, the content model as schema files, the accounts, the second locale and the sample content through the admin's own API (the same script the step pack's test site is built with) |
| `testing/site.feature` | The first feature a Strapi app gets when testing is set up |
| `ai/agents/strapi-site-builder.md` | The agent that builds and maintains Strapi apps with these commands |
| `ai/agents/strapi-tester.md` | The agent that writes and runs scenarios with the Strapi step pack |
| `ai/skills/strapi-scenarios/` | The skill: the step pack's phrases by area, the traps found on a real app, three example features |
| `ai/commands/strapi-test.md` | The slash command `/strapi-test <site>`: set up, match every step, run, report |
| `ai/prompts/strapi-build-and-test.md`, `strapi-scenarios-for-an-area.md` | Two prompts: whole launch commands for a new session |
| `src/index.ts` | `register(api)`: what the assistant is told about Strapi here |
| `features/strapi.feature` | Scenarios for the dashboard's own browser suite |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.

## What is different from a PHP platform

Strapi is a Node.js app and DDEV has no project type for it. The plugin keeps the shape of the
reference and changes only this:

| | WordPress (the reference) | Strapi |
| --- | --- | --- |
| Project | `--project-type=wordpress`, nginx and PHP | `--project-type=generic --webserver-type=generic`: no web server of the container tool's own; the router sends the project's address to the app's port (1337), and the web container runs the server as a daemon, in production (`.ddev/config.strapi.yaml`) |
| Recognised by | The DDEV project type | The file `.ddev/config.strapi.yaml` |
| The language | PHP, in the web image | Node.js 24 (the workspace's line, which Strapi supports), baked into the web image (`.ddev/web-build/Dockerfile.strapi`) |
| Database | The container tool's default, settings written by the tool | PostgreSQL 17 from the container tool; the installer writes the container's own `db` / `db` / `db` into `app/.env` |
| Getting the code | `wp core download` | `npx create-strapi@latest app --skip-cloud`: the official installer, without the cloud login, TypeScript, npm |
| Install | `wp core install` | `strapi build` for production; with `--install` the workspace account is made the Super Admin with `strapi admin:create-user` |
| Accounts | WP-CLI | `scripts/strapi-site.mjs`, through the admin's own API (the role API) |
| Users menu of the row | Reads the project type | Does not apply (the type is `generic`): the Strapi CLI tool's `--add-users`, or `cmd-tools-add-users.sh <name> strapi` |

The Community Edition only: the installer runs with `--skip-cloud` (no cloud login, no trial),
telemetry is off (`STRAPI_TELEMETRY_DISABLED=true`, and `telemetryDisabled` in the app's
`package.json`), and no licence key is ever set. The admin still shows the paid plans' pages in its
settings menu (they open an offer, not a feature); the plugin never opens them.

## The commands

Run them from a sites folder. `--help` is safe on both.

### Build an app

```bash
cd ~/workspace/dev
bash cmd-strapi-project.sh mysite --install --add-users --sample-content
```

| Flag | What it does |
| --- | --- |
| `--install` | Give the app its Super Admin: the workspace account (its password must have 8 characters or more, a capital, a small letter and a number: the admin's rule) |
| `--add-users` | With `--install`: add the default accounts |
| `--sample-content` | Add a content model and its sample content: an Article collection type (title, slug, summary, rich text, cover image, category, a true/false field, and a dynamic zone of the components Quote, Rich text and Media), a Category collection type, a Homepage single type with a Seo component, English and French, 4 categories, 24 articles (5 in French too), the homepage in both locales, 5 images (2 in the folder "Covers") |
| `--strapi-version <x>` | The release of the installer: a release (`5.63.0`), a major release (`5`) or `latest`, the default |
| `--launch` | Open the admin when it is ready |

The app answers at `https://mysite.ddev.site`, its admin at `/admin` (the address of the site sends
a visitor there). It is what `create-strapi` makes, in the project's `app/` folder; what the builder
adds is marked "Webship test site" in each file it writes: the address and the proxy in
`app/config/server.ts`, `FLAG_NPS=false` in `app/.env` (no survey over the admin),
`app/src/admin/app.tsx` (no release notification: the admin would ask GitHub's API for the latest
release on every page), and with `--sample-content` the content model in `app/src/api` and
`app/src/components`. The server is `strapi start` in production, so the Content-Type Builder only
reads: change a model in the files, then build again (`--build`). A project of the same name is
deleted first. The first build takes a few minutes (the installer's packages, then the admin's
build).

### Work on an app

```bash
bash cmd-tools-strapi-cli.sh mysite                                   # version, server, content types, accounts
bash cmd-tools-strapi-cli.sh mysite --run "content-types:list"        # any Strapi CLI command
bash cmd-tools-strapi-cli.sh mysite --build                           # build again for production, restart
bash cmd-tools-strapi-cli.sh mysite --update                          # the latest release of its major release, build, restart
bash cmd-tools-strapi-cli.sh mysite --restart                         # start the server again and wait for it
bash cmd-tools-strapi-cli.sh mysite --add-users                       # the default accounts
bash cmd-tools-strapi-cli.sh mysite --cancel-users                    # delete them
```

On a start or a restart the container tool may print "Unable to start web_extra_daemons" with
"supervisor.sock no such file": it asked before the web container was ready, and the container starts
the server by itself a moment later. `--restart` starts it again and waits until it answers.

npm 11 (the npm of Node.js 24) does not run the install scripts of packages it was not told to trust;
the installer's packages build and run without them.

### The default accounts

| Account | Address | Role | Handle in the tests |
| --- | --- | --- | --- |
| `administrator` | `administrator@example.com` | Super Admin | `administrator` |
| `editor` | `editor@example.com` | Editor: every entry of every content type, publishing included | `editor` |
| `author` | `author@example.com` | Author: the entries it made itself, no publishing | `author` |

The admin logs in with the email address. Each account has the password of the workspace's other
default lists. They are for local apps and for tests; the app's Super Admin from `--install` is the
workspace account and is never written into a test.

**Manage them with the Strapi CLI tool, not the row's Users menu.** The dashboard's Users menu picks
its actions by the project type, and a Strapi app's type is `generic`, so the menu offers no action
that applies to it. Use:

```bash
bash cmd-tools-strapi-cli.sh mysite --add-users      # add them, or give them back their name, password, role and active state
bash cmd-tools-strapi-cli.sh mysite --cancel-users   # delete them
bash cmd-tools-add-users.sh mysite strapi            # the core's tool: the same list
bash cmd-tools-cancel-users.sh mysite strapi
```

The admin allows 5 logins of an account in 5 minutes from one address, and these tools log in as the
workspace account once per run. A run that meets the limit says so and waits for it to end (at most
five minutes), then goes on.

### Test an app

```bash
bash cmd-tools-testing.sh mysite                 # webship-js, the step pack, the users registry, a first feature
bash cmd-tools-testing.sh mysite --run           # run the suite in the container
bash cmd-tools-testing.sh mysite --run --path tests/features/site.feature
```

`cmd-tools-testing.sh` is the workspace's own. For a Strapi app it also adds
`@webship-js/strapi-steps` to `package.json`, lists its step definitions in `cucumber.js` after
webship-js's own, writes the users registry (the handles above, by their email addresses, overridable
with `STRAPI_<HANDLE>_EMAIL` and `STRAPI_<HANDLE>_PASSWORD`), `adminPath` (`/admin`), `dataAdmin` (the
handle the step pack makes and deletes its test entries as), the browser messages that are no error of
the app, and the tags that keep the pack's assertions that must fail out of a normal run, places
`tests/features/site.feature` when the project has none, and makes sure the default accounts are in
the app. Run it again and it adds what is missing and keeps what you changed.

The suite runs in the project's container, where the network changes of the host (another container
starting) do not cut the browser's requests.

A scenario of your own reads like this one, from the step pack's phrases (the skill
`strapi-scenarios` lists them by area); the entries it makes are deleted after it:

```gherkin
Feature: The editor writes an article
  Scenario: An article in a category
    Given there is no "Article" entry "Readme test article"
    And I am a logged in user with the "editor" user
    When I create a new "Article" entry
    And I set "title" to "Readme test article"
    And I regenerate the "slug"
    And I choose "Guides" in the "category" relation
    And I save the entry
    Then I should see the notification "Saved document"
    And the status of the entry should be "Draft"
```

`tests/features/site.feature` passes on an app built with `--install --add-users`. The features of
the step pack, and the scenario above, pass on an app built with `--install --add-users --sample-content`.

## The AI items

`ai/` in the package holds one folder per kind, the manifest's `ai` block names each item, and
`--install` places it in the workspace folder of that kind.

| Kind | Item | Use it to |
| --- | --- | --- |
| Agent | `strapi-site-builder` | Build, update, restart, maintain or remove a Strapi app with the commands above, in containers only |
| Agent | `strapi-tester` | Set the testing stack up, look at the admin in the Playwright MCP browser first, write scenarios from the pack's steps and run them; it never creates an account in a suite and never writes a platform name into a step phrase |
| Skill | `strapi-scenarios` | Write a scenario from phrases that exist: the pack's steps by area, the handles of the users registry, the test entries, the traps found on a real app, and three features that pass on an app with the sample content |
| Command | `/strapi-test <site> [feature or @tag]` | Run the suite of an app from inside a session: set up when missing, match every step, run, report what failed and why |
| Prompt | `strapi-build-and-test` | Start a session that builds an app, says what it is, sets the testing stack up and runs the first feature |
| Prompt | `strapi-scenarios-for-an-area` | Start a session that writes and runs the scenarios of one area of the admin |

After `--install` each is in its folder on the dashboard. **Install** there puts an agent, a skill
or a command into Claude Code (`~/.claude/agents`, `~/.claude/skills`, `~/.claude/commands`), or
from the command line:

```bash
cd ~/workspace/ai-agents   && bash cmd-tools-ai-items.sh strapi-tester --install
cd ~/workspace/ai-skills   && bash cmd-tools-ai-items.sh strapi-scenarios --install
cd ~/workspace/ai-commands && bash cmd-tools-ai-items.sh strapi-test --install
```

A prompt is not installed: it is the whole `claude …` launch command of a new session, and the
dashboard's **New screen** form lists it as a template. By hand, fill the placeholders in and run
the command of the file from the folder it names.

The items are written for any AI CLI, with Claude Code as the default shape: the frontmatter and
the file layout are Claude Code's, the body of each item is plain Markdown that names no tool or
feature of one CLI, a command says in words what its arguments are, and the text between the
triple quotes of a prompt can be given to another AI CLI as it is.

Every step phrase the items show is checked against the definitions of the step pack and of
webship-js (`tests/fixtures/step-definitions.txt`), and every command and flag against the
plugin's own.

## Develop it

```bash
npm install     # builds dist/ (TypeScript)
npm run lint
npm test        # the manifest, the commands, the AI items, the functions against a scaffolded project
```

CI runs the same on Node.js 20 and 24, parses every shell script, and runs the plugin's
`features/strapi.feature` against a dashboard with this plugin installed
(`webship/workspace/.github/workflows/plugin-browser-suite.yml`).
