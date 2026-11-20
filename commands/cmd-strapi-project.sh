#!/usr/bin/env bash

# workspace-name: Strapi (create-strapi, PostgreSQL)

# Installed by the Strapi plugin (plugins.sh --install strapi); __WORKSPACE__ is the workspace it was installed into.
#
# Build a Strapi app in a container: an app made with the official installer (create-strapi), the
# Community Edition, on PostgreSQL, at https://<name>.ddev.site/admin. With --install the workspace
# account becomes its Super Admin; with --add-users it also gets the default accounts; with
# --sample-content a content model (articles, categories, a homepage, a dynamic zone, two locales)
# and its sample content.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

# Distribution.
distribution_name="strapi";
distribution_title="Strapi";
distribution_webroot="";

ARGPARSE_DESCRIPTION="Build a ${distribution_title} project in __WORKSPACE__"
# The args file comes with the plugin: core/scripts/plugins/strapi/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/strapi/args/arg-strapi.sh || exit 1 ;

shift $#;

strapi_build ;
