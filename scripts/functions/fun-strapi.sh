#!/usr/bin/env bash

# Strapi for the Webship Workspace: build an app, run the Strapi CLI on it, add its default accounts,
# and wire its step pack into the testing setup.
#
# Placed by `plugins.sh --install strapi` in core/scripts/plugins/strapi/functions/, where bootstrap
# sources it after the core's own functions. Everything runs in the project's container (DDEV by
# default), never on the host: the web image gets the Node.js the app runs on, the app is made by the
# official installer (create-strapi) in the project's app/ folder, the web container runs its server
# in production as a daemon, the router serves it at the project's address, and PostgreSQL is the
# container tool's database. Only the Community Edition: no licence key, no trial, no cloud login
# (the installer runs with --skip-cloud), and telemetry off.
#
# Strapi is a Node.js app and DDEV has no project type for it, so a Strapi project is recognised by a
# file (.ddev/config.strapi.yaml, written by the builder), and four names are the ones the core's
# tools look for:
#   set_strapi_users          the default accounts                (cmd-tools-add-users.sh <project> strapi)
#   add_strapi_users          create them through the admin's API (the same tool, and --add-users of the builder)
#   cancel_strapi_users       delete them                         (cmd-tools-cancel-users.sh <project> strapi)
#   testing_configure_strapi  the step pack in the testing stack  (cmd-tools-testing.sh <project>)

# The step pack a Strapi project is tested with, and the release line it is required at.
readonly STRAPI_STEPS_PACKAGE='@webship-js/strapi-steps';
readonly STRAPI_STEPS_VERSION='^2.0.0';

# Where the app lives in the web container, and the port its server listens on.
readonly STRAPI_ROOT='/var/www/html';
readonly STRAPI_APP='/var/www/html/app';
readonly STRAPI_PORT='1337';

# The default accounts, the ones a scenario logs in as: a Super Admin, an Editor (every entry, publishing
# included) and an Author (the entries it made itself, no publishing). Accounts are configuration, created
# once on the app; a test suite never creates or deletes one. The admin logs in with the email address.
# The Super Admin the builder creates with --install is the workspace account and is not in this list.
function set_strapi_users() {
  users=(administrator editor author);
  local user ;
  for user in "${users[@]}" ; do
    printf -v "user_${user}_name" '%s' "${user}" ;
    printf -v "user_${user}_mail" '%s' "${user}@example.com" ;
    printf -v "user_${user}_password" '%s' 'dD.123123ddd' ;
  done
  user_administrator_role='strapi-super-admin' ;
  user_editor_role='strapi-editor' ;
  user_author_role='strapi-author' ;
}

# Is this folder a Strapi project of this plugin? The builder leaves .ddev/config.strapi.yaml in it.
function strapi_is_project() {
  local project_path="$1";
  [ -f "${project_path}/.ddev/config.strapi.yaml" ] ;
}

# Go to the project a tool was asked about, or say why not.
function strapi_enter_project() {
  local project_path="${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}";
  if [ ! -d "${project_path}" ] ; then
    echo "No project ${PROJECT_NAME} in ${WORKSPACE_ROOT}/${doc_name}." ;
    return 1 ;
  fi
  if ! strapi_is_project "${project_path}" ; then
    echo "${doc_name}/${PROJECT_NAME} is not a Strapi project of this plugin (it has no .ddev/config.strapi.yaml)." ;
    return 1 ;
  fi
  cd "${project_path}" || return 1 ;
}

# What the container tool is told about the app: the router sends the project's address to the app's
# port, the server runs in production as a daemon of the web container once the build has finished,
# telemetry is off, and Node.js is in the web image itself. The container tool installs the Node.js of
# the project when the container starts, after the daemons have started and within a short time limit:
# baked into the image, the Node.js the app was built with is there before anything starts.
function strapi_write_ddev_config() {
  local project_path="$1" nodejs_version="$2";
  mkdir -p "${project_path}/.ddev/web-build" || return 1 ;
  cat > "${project_path}/.ddev/config.strapi.yaml" <<YAMLEOF
# Strapi in this project. Written by the Strapi builder of the workspace; build again rather than
# editing by hand. The web container serves no files of its own: the router sends ports 80 and 443
# of the project's address to the app's server, which the web container runs as a daemon, in
# production, once the app is built (app/.ready).
web_extra_exposed_ports:
  - name: strapi
    container_port: ${STRAPI_PORT}
    http_port: 80
    https_port: 443
web_extra_daemons:
  - name: strapi
    command: "bash -c 'while [ ! -f ${STRAPI_APP}/.ready ]; do sleep 2; done; cd ${STRAPI_APP} && export NODE_ENV=production && exec ./node_modules/.bin/strapi start'"
    directory: ${STRAPI_ROOT}
web_environment:
  - STRAPI_TELEMETRY_DISABLED=true
YAMLEOF
  cat > "${project_path}/.ddev/web-build/Dockerfile.strapi" <<DOCKEREOF
# Node.js ${nodejs_version} in the web image, so the app's server has it before the container's daemons
# start. Written by the Strapi builder of the workspace.
RUN N_PREFIX=/usr/local n install ${nodejs_version} && node --version
DOCKEREOF
}

# The Strapi CLI in the container, in the folder of the app, in production.
function strapi_cli() {
  ddev exec -d "${STRAPI_APP}" "NODE_ENV=production ./node_modules/.bin/strapi $*" < /dev/null ;
}

# npm in the container, in the folder of the app.
function strapi_npm() {
  ddev exec -d "${STRAPI_APP}" "npm $*" < /dev/null ;
}

# The release of Strapi the app has installed.
function strapi_version() {
  ddev exec "node -p \"require('${STRAPI_APP}/node_modules/@strapi/strapi/package.json').version\"" < /dev/null 2>/dev/null | tr -d '\r' ;
}

# Wait until the app's server answers its health check on its own port.
function strapi_wait() {
  local attempt code ;
  for attempt in $(seq 1 90) ; do
    code="$(ddev exec "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${STRAPI_PORT}/_health" < /dev/null 2>/dev/null | tr -d '\r')" ;
    [ "${code}" == '204' ] && return 0 ;
    sleep 2 ;
  done
  echo "The Strapi server did not start; the end of its log:" ;
  ddev logs -s web --tail 60 < /dev/null 2>/dev/null ;
  return 1 ;
}

# Start the app's server again (the daemon of the web container), and wait for it.
function strapi_restart() {
  ddev exec "supervisorctl restart webextradaemons:strapi" < /dev/null || return 1 ;
  strapi_wait ;
}

# Build the app and its admin for production, and serve the new build.
function strapi_production_build() {
  echo "Building the app and its admin for production (strapi build)." ;
  ddev exec -d "${STRAPI_APP}" "NODE_ENV=production npm run build" < /dev/null || { echo "The build of the app failed." ; return 1 ; } ;
  ddev exec "touch ${STRAPI_APP}/.ready" < /dev/null ;
  strapi_restart ;
}

# Run verbs of strapi-site.mts (config <url>, schema, accounts <verb>, locales, seed) with the app's
# Node.js, in the folder of the app. The script is TypeScript, piped to Node.js as it is
# (--input-type=module-typescript), and the accounts travel as base64
# of a JSON object, so no password is written into a file of the project and no quoting can break a
# value. The owner is the workspace account: the Super Admin the verbs that talk to the admin's API
# log in as.
function strapi_site() {
  local script="${WORKSPACE_SCRIPTS}/plugins/strapi/strapi-site.mts" rows="" user name mail password role payload ;
  if [ ! -f "${script}" ] ; then
    echo "strapi-site.mts is not in ${WORKSPACE_SCRIPTS}/plugins/strapi: install the plugin (plugins.sh --install strapi)." ;
    return 1 ;
  fi
  for user in "${users[@]}" ; do
    name="user_${user}_name"; mail="user_${user}_mail"; password="user_${user}_password"; role="user_${user}_role";
    rows="${rows}${!name}"$'\x1f'"${!mail}"$'\x1f'"${!password}"$'\x1f'"${!role}"$'\x1e' ;
  done
  payload="$(STRAPI_OWNER_NAME="${account_name}" STRAPI_OWNER_MAIL="${account_mail}" STRAPI_OWNER_PASS="${account_pass}" \
    STRAPI_ROWS="${rows}" python3 -c '
import base64, json, os
def account(row):
    handle, email, password, role = row.split("\x1f")
    return {"handle": handle, "firstname": handle.capitalize(), "lastname": "Webship", "email": email, "password": password, "role": role}
accounts = [account(row) for row in os.environ["STRAPI_ROWS"].split("\x1e") if row]
owner = {"handle": "owner", "firstname": os.environ["STRAPI_OWNER_NAME"], "lastname": "", "email": os.environ["STRAPI_OWNER_MAIL"], "password": os.environ["STRAPI_OWNER_PASS"]}
print(base64.b64encode(json.dumps({"owner": owner, "accounts": accounts}).encode()).decode())')" || return 1 ;
  # The accounts go in on the standard input, as a first line before the script: on no command line
  # a failed run prints.
  { printf "globalThis.STRAPI_SITE_ACCOUNTS = '%s';\n" "${payload}"; cat "${script}"; } \
    | ddev exec -d "${STRAPI_APP}" "STRAPI_SITE_URL=http://127.0.0.1:${STRAPI_PORT} node --input-type=module-typescript - $*" ;
}

# Build a Strapi app from nothing: the container, the installer, the settings of the container, with
# --sample-content the content model, the production build, and with --install its Super Admin.
function strapi_build() {
  trim_project_name ;
  local base_url="https://${PROJECT_NAME}.ddev.site" ;
  local version="${STRAPI_VERSION:-${site_strapi_version:-latest}}" ;
  local project_path="${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}" ;

  if ! [[ "${version}" =~ ^(latest|[0-9]+(\.[0-9]+){0,2})$ ]] ; then
    echo "--strapi-version takes a release (5.63.0), a major release (5) or latest, not ${version}. Nothing was changed." ;
    exit 1 ;
  fi
  if [ "${ADD_USERS}" == 'yes' ] && [ "${INSTALL}" != 'yes' ] ; then
    echo "--add-users needs --install: the default accounts are added by the app's Super Admin, the workspace account." ;
    exit 1 ;
  fi

  cd ${WORKSPACE_ROOT}/${doc_name} || exit 1 ;

  drop_database ;
  rm -rf "${PROJECT_NAME}" ;
  mkdir -p "${PROJECT_NAME}" ;
  cd "${project_path}" || exit 1 ;

  # A generic web server: no nginx and no PHP are started. The database is PostgreSQL.
  ddev config --project-type=generic --webserver-type=generic --docroot="" --project-name=${PROJECT_NAME} \
    --database=postgres:17 --nodejs-version=$(ddev_nodejs_version) || exit 1 ;
  strapi_write_ddev_config "${project_path}" "$(ddev_nodejs_version)" || exit 1 ;
  ddev_up start -y || exit 1 ;

  # The installer: TypeScript (its default), npm, no example data, no git repository, PostgreSQL of the
  # container (db / db / db), and no cloud login (--skip-cloud). It takes a few minutes.
  echo "Making the app with create-strapi@${version} (a few minutes)." ;
  ddev exec "rm -rf ${STRAPI_APP} && cd ${STRAPI_ROOT} && npx -y create-strapi@${version} app --no-run --skip-cloud --non-interactive --typescript --use-npm --install --no-example --no-git-init --dbclient=postgres --dbhost=db --dbport=5432 --dbname=db --dbusername=db --dbpassword=db" < /dev/null \
    || { echo "create-strapi failed." ; exit 1 ; } ;

  users=() ;
  strapi_site config "${base_url}" || exit 1 ;
  if [ "${SAMPLE_CONTENT}" == 'yes' ] ; then
    strapi_site schema || exit 1 ;
  fi
  strapi_production_build || exit 1 ;

  if [ "${INSTALL}" == 'yes' ] ; then
    echo "Making the workspace account the Super Admin (strapi admin:create-user)." ;
    strapi_cli "admin:create-user --firstname='${account_name}' --email='${account_mail}' --password='${account_pass}'" \
      || { echo "The Super Admin could not be created (the admin wants a password of 8 characters or more, with a capital, a small letter and a number)." ; exit 1 ; } ;

    local verbs="" ;
    if [ "${ADD_USERS}" == 'yes' ] ; then
      set_strapi_users ;
      verbs="accounts add" ;
    fi
    if [ "${SAMPLE_CONTENT}" == 'yes' ] ; then
      verbs="${verbs} locales seed" ;
    fi
    if [ -n "${verbs}" ] ; then
      # One run of the site script: it logs in once (the admin allows 5 logins of an account in 5 minutes).
      strapi_site ${verbs} || exit 1 ;
    fi
    users=() ;

    echo "${doc_name} ${PROJECT_NAME} has been installed: Strapi $(strapi_version).";
    echo "Go to ${base_url}/admin and log in as ${account_mail}";
  else
    [ "${SAMPLE_CONTENT}" == 'yes' ] && echo "--sample-content: the content model is in place; its sample content needs a Super Admin (build with --install)." ;
    echo "${doc_name} ${PROJECT_NAME} is ready, without an administrator: Strapi $(strapi_version).";
    echo "Its admin asks for the first administrator at ${base_url}/admin, or: bash cmd-tools-strapi-cli.sh ${PROJECT_NAME} --run \"admin:create-user --firstname=<name> --email=<email> --password=<password>\"";
  fi

  if [ "${LAUNCH}" == 'yes' ] ; then
    ddev launch /admin ;
  fi

  cd ${WORKSPACE_ROOT}/${doc_name};
}

# Create the default accounts through the admin's API, as the workspace account. An account that is
# already there gets its name, password, role and active state back. The list is loaded by the caller
# (set_strapi_users): the core's add_users, the builder, the CLI tool.
function add_strapi_users() {
  strapi_enter_project || return 1 ;
  local user user_name user_mail user_password user_role ;
  for user in "${users[@]}" ; do
    user_name="user_${user}_name"; user_mail="user_${user}_mail";
    user_password="user_${user}_password"; user_role="user_${user}_role";

    echo " ---------------------------------------------------------------- ";
    echo "      User name: ${!user_name}";
    echo "      User mail: ${!user_mail}";
    echo "  User password: ${!user_password}";
    echo "      User role: ${!user_role}";
    echo " ================================================================= ";
  done
  strapi_site accounts add ;
  local status=$? ;
  cd ${WORKSPACE_ROOT}/${doc_name};
  return ${status} ;
}

# Delete the default accounts (never the workspace account).
function cancel_strapi_users() {
  strapi_enter_project || return 1 ;
  local user user_name ;
  for user in "${users[@]}" ; do
    user_name="user_${user}_name";
    echo " ---------------------------------------------------------------- ";
    echo "      User name: ${!user_name}";
    echo " ================================================================= ";
  done
  strapi_site accounts cancel ;
  local status=$? ;
  cd ${WORKSPACE_ROOT}/${doc_name};
  return ${status} ;
}

# What cmd-tools-strapi-cli.sh does: the first of --run, --build, --update, --restart, --add-users,
# --cancel-users that was asked for; with none of them, what the app is.
function strapi_cli_tool() {
  trim_project_name ;
  strapi_enter_project || exit 1 ;

  if ! ddev describe -j 2>/dev/null | grep -q '"status":"running"' ; then
    ddev start -y || exit 1 ;
  fi

  if [ ! "${RUN}" == '_none_' ] ; then
    # Unquoted on purpose: --run "content-types:list" is a command and its arguments.
    strapi_cli ${RUN} ;
    exit $? ;
  fi

  if [ "${BUILD}" == 'yes' ] ; then
    strapi_production_build || exit 1 ;
    echo "Strapi $(strapi_version): the new build is served at https://${PROJECT_NAME}.ddev.site/admin" ;
  elif [ "${UPDATE}" == 'yes' ] ; then
    local installed output status ; installed="$(strapi_version)" ;
    echo "Strapi ${installed} is installed; updating within its major release with the official upgrade tool." ;
    # The tool's output stays on screen as it comes; it is kept to read its answer. On an app already on
    # the latest release of its major release, the tool says so and exits with 1: nothing to do then.
    output="$(mktemp)" ;
    ddev exec -d "${STRAPI_APP}" "npx -y @strapi/upgrade minor --yes" < /dev/null 2>&1 | tee "${output}" ;
    status=${PIPESTATUS[0]} ;
    if [ "${status}" -ne 0 ] ; then
      if grep -q 'already up-to-date' "${output}" ; then
        rm -f "${output}" ;
        echo "Strapi ${installed} is the latest release of its major release: nothing to update." ;
        exit 0 ;
      fi
      rm -f "${output}" ;
      exit 1 ;
    fi
    rm -f "${output}" ;
    strapi_production_build || exit 1 ;
    echo "Strapi $(strapi_version) is running." ;
  elif [ "${RESTART}" == 'yes' ] ; then
    strapi_restart || exit 1 ;
    echo "Strapi $(strapi_version) is running." ;
  elif [ "${ADD_USERS}" == 'yes' ] ; then
    set_strapi_users ;
    add_strapi_users ;
  elif [ "${CANCEL_USERS}" == 'yes' ] ; then
    set_strapi_users ;
    cancel_strapi_users ;
  else
    echo "${doc_name}/${PROJECT_NAME}: Strapi $(strapi_version) at https://${PROJECT_NAME}.ddev.site/admin" ;
    echo "" ;
    if [ -f app/.ready ] && ddev exec "curl -fsS -o /dev/null http://127.0.0.1:${STRAPI_PORT}/_health" < /dev/null > /dev/null 2>&1 ; then
      echo "Server: running (strapi start, production)" ;
    else
      echo "Server: not answering; start it again with --restart (or build with --build)" ;
    fi
    echo "" ; echo "Content types:" ;
    ddev exec "ls ${STRAPI_APP}/src/api 2>/dev/null | sed 's/^/   /'" < /dev/null ;
    echo "" ; echo "Accounts:" ;
    users=() ;
    strapi_site accounts list ;
  fi
  cd ${WORKSPACE_ROOT}/${doc_name};
}

# The step pack in the testing stack of a Strapi project. The core's testing_configure calls this in the
# project folder once webship-js is scaffolded and before the dependencies are installed; for a project
# that is not one of this plugin's it changes nothing.
#
# It adds the pack to package.json, lists its step definitions in cucumber.js after webship-js's own,
# gives cucumber.js the tags that keep the pack's assertions that must fail out of a normal run, the path
# of the admin, the handle the test-data steps work as (dataAdmin), the browser messages that are no error
# of the app, and the users registry of the default accounts (a handle a scenario reads, mapped to an
# account; never the workspace account), and writes a first feature when the project has none of its own.
# Every part is skipped when it is already there, so a second run adds what the first missed and never
# resets a suite.
function testing_configure_strapi() {
  local project_path="$1";
  strapi_is_project "${project_path}" || return 0 ;
  if [ ! -f "${project_path}/cucumber.js" ] || [ ! -f "${project_path}/package.json" ] ; then
    echo "  Strapi: cucumber.js is not here yet — run the testing setup again once webship-js is scaffolded." ;
    return 1 ;
  fi

  echo "Adding the Strapi step pack (${STRAPI_STEPS_PACKAGE} ${STRAPI_STEPS_VERSION}).";
  set_strapi_users ;
  local registry="" user user_mail user_password ;
  for user in "${users[@]}" ; do
    user_mail="user_${user}_mail"; user_password="user_${user}_password";
    registry="${registry}${user}|${!user_mail}|${!user_password}"$'\n' ;
  done

  python3 - "${project_path}" "${STRAPI_STEPS_PACKAGE}" "${STRAPI_STEPS_VERSION}" 'STRAPI' "${registry}" <<'PYEOF' || return 1
import json, re, sys

project, pack, version, prefix, registry = sys.argv[1:6]

# package.json: the pack as a dev dependency, at the release line this plugin was proven on.
pkg_file = project + '/package.json'
pkg = json.load(open(pkg_file))
if pack not in pkg.get('dependencies', {}) and pack not in pkg.get('devDependencies', {}):
    pkg.setdefault('devDependencies', {})[pack] = version
    open(pkg_file, 'w').write(json.dumps(pkg, indent=4) + '\n')
    print('  package.json: %s %s' % (pack, version))

# cucumber.js: the pack's step definitions after webship-js's own, the tags of the pack's lane, and in
# worldParameters the admin's path, the test-data account, the browser messages to ignore and the users
# registry.
cucumber_file = project + '/cucumber.js'
src = open(cucumber_file).read()
before = src

if ('node_modules/%s/' % pack) not in src:
    line = "'node_modules/%s/tests/step-definitions/**/*.js'," % pack
    core = re.search(r"^([ \t]*)'node_modules/webship-js/tests/step-definitions/[^']*',.*$", src, re.M)
    opening = re.search(r"^([ \t]*)require:[ \t]*\[[ \t]*$", src, re.M)
    if core:
        src = src[:core.end()] + '\n' + core.group(1) + line + src[core.end():]
    elif opening:
        src = src[:opening.end()] + '\n' + opening.group(1) + '  ' + line + src[opening.end():]
    else:
        sys.exit("  cucumber.js has no require list this can add to. Add this line to it:\n    " + line)
    print('  cucumber.js: the step definitions of %s' % pack)

if not re.search(r"^[ \t]*tags:", src, re.M):
    default = re.search(r"^([ \t]*)default:[ \t]*\{[ \t]*$", src, re.M)
    if default:
        pad = default.group(1) + '  '
        block = [
            pad + "// The pack's assertions that must fail are no part of a normal run.",
            pad + "tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',",
        ]
        src = src[:default.end()] + '\n' + '\n'.join(block) + src[default.end():]
        print('  cucumber.js: the tags that keep the assertions that must fail out of a normal run')

world = re.search(r"^([ \t]*)worldParameters:[ \t]*\{[ \t]*$", src, re.M)
if not world:
    sys.exit("  cucumber.js has no worldParameters block to add the users registry to.")
pad = world.group(1) + '  '
additions = []
if not re.search(r"^[ \t]*adminPath:", src, re.M):
    additions += [
        pad + "// Where the admin is on the site ('/admin', the default of the app).",
        pad + "adminPath: process.env.ADMIN_PATH || '/admin',",
    ]
if not re.search(r"^[ \t]*dataAdmin:", src, re.M):
    additions += [
        pad + "// The account the test-data steps make and delete the test entries as: a Super Admin of `users`.",
        pad + "dataAdmin: process.env.DATA_ADMIN || 'administrator',",
    ]
if not re.search(r"^[ \t]*javascript:", src, re.M):
    additions += [
        pad + "// Browser messages that are no error of the app: the 404 of the optional features the admin asks for on",
        pad + "// every entry (its preview, its AI translations), the second logout request the admin sends (401), and a",
        pad + "// request lost when the network of the machine changed.",
        pad + "javascript: { mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn', levels: ['error'], ignore: 'the server responded with a status of 40[14]|net::ERR_NETWORK_CHANGED', beforeScenario: false, afterScenario: true },",
    ]
if not re.search(r"^[ \t]*users:[ \t]*\{", src, re.M):
    rows = [r.split('|') for r in registry.splitlines() if r.strip()]
    additions += [
        pad + "// The users registry: a handle a scenario reads, mapped to an account of this app (the default",
        pad + "// accounts: cmd-tools-strapi-cli.sh --add-users). The admin logs in with the email address. Override",
        pad + "// one with %s_<HANDLE>_EMAIL and %s_<HANDLE>_PASSWORD." % (prefix, prefix),
        pad + "users: {",
    ]
    for handle, email, password in rows:
        env = '%s_%s' % (prefix, handle.upper())
        additions.append(pad + "  %s: { email: process.env.%s_EMAIL || '%s', password: process.env.%s_PASSWORD || '%s' }," % (handle, env, email, env, password))
    additions.append(pad + "},")
    print('  cucumber.js: the users registry (%s)' % ', '.join(r[0] for r in rows))
if additions:
    src = src[:world.end()] + '\n' + '\n'.join(additions) + src[world.end():]

if src != before:
    open(cucumber_file, 'w').write(src)
PYEOF

  # A first feature, when the project has none for the app yet: the login page, each default account,
  # a refused login, and what the editor may not open.
  local feature="${WORKSPACE_SCRIPTS}/plugins/strapi/site.feature" ;
  if [ -f "${feature}" ] && [ ! -f "${project_path}/tests/features/site.feature" ] ; then
    mkdir -p "${project_path}/tests/features" && cp "${feature}" "${project_path}/tests/features/site.feature" \
      && echo "  tests/features/site.feature: a first feature for the app" ;
  fi

  # The scenarios log in as the default accounts: make sure an app that has its Super Admin has them.
  if ( cd "${project_path}" && users=() && strapi_site accounts installed ) > /dev/null 2>&1 ; then
    if ( add_strapi_users > /dev/null 2>&1 ) ; then
      echo "  the default accounts are in the app (${users[*]})" ;
    else
      echo "  The default accounts could not be written: is the app running (ddev start in ${project_path})?" ;
    fi
  else
    echo "  The app has no Super Admin yet: the scenarios that log in need an app built with --install." ;
  fi
}
