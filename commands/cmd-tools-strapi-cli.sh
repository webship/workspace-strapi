#!/usr/bin/env bash

# Installed by the Strapi plugin (plugins.sh --install strapi); __WORKSPACE__ is the workspace it was installed into.
#
# The Strapi CLI of one Strapi app of this workspace, with the app's Node.js, in its container: say
# what the app is, run a command, build the admin again, update Strapi within its major release,
# restart the server, add or cancel the default accounts. Nothing here runs on the host.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

# Distribution.
distribution_name="strapi";

ARGPARSE_DESCRIPTION="Run the Strapi CLI of a Strapi app of __WORKSPACE__: status, a command, a build, an update, a restart, the default accounts"
# The args file comes with the plugin: core/scripts/plugins/strapi/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/strapi/args/arg-strapi-cli.sh || exit 1 ;

shift $#;

strapi_cli_tool ;
