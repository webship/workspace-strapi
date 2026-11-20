#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The Strapi project in this workspace.')
parser.add_argument('-r', '--run',
                    default="_none_",
                    help='A Strapi CLI command to run in the app, with its arguments. Example: --run "content-types:list"')
parser.add_argument('-b', '--build',
                    action='store_true',
                    default=False,
                    help='Build the app and its admin again for production, and restart the server.')
parser.add_argument('-u', '--update',
                    action='store_true',
                    default=False,
                    help='Update Strapi to the latest release of its major release with the official upgrade tool, build, and restart the server.')
parser.add_argument('--restart',
                    action='store_true',
                    default=False,
                    help='Start the server again, and wait for it.')
parser.add_argument('-a', '--add-users',
                    action='store_true',
                    default=False,
                    help='Add the default accounts. An account that is already there gets its name, password, role and active state back.')
parser.add_argument('-c', '--cancel-users',
                    action='store_true',
                    default=False,
                    help='Delete the default accounts (never the workspace account).')
ARGEOF
