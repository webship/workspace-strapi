#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The name of the project: its folder, its DDEV project and its host name.')
parser.add_argument('-i', '--install',
                    action='store_true',
                    default=False,
                    help='Give the app its Super Admin: the workspace account.')
parser.add_argument('-a', '--add-users',
                    action='store_true',
                    default=False,
                    help='With --install, add the default accounts (administrator, editor, author): the ones the test scenarios log in as.')
parser.add_argument('-s', '--sample-content',
                    action='store_true',
                    default=False,
                    help='Add a content model (an Article and a Category collection type, a Homepage single type, components and a dynamic zone, English and French) and its sample content: 4 categories, 24 articles, the homepage, 5 images.')
parser.add_argument('-v', '--strapi-version',
                    default="",
                    help='A release (5.63.0), a major release (5); empty means latest. The release of the installer, create-strapi, the build runs ("latest" works too). Example: --strapi-version 5.63.0')
parser.add_argument('-l', '--launch',
                    action='store_true',
                    default=False,
                    help='Open the admin in a browser when it is ready.')
ARGEOF
