"""``nomad-sdk`` command-line interface (standard library only)."""

from __future__ import annotations

import argparse
import sys

from nomad_sdk import __version__


def _whoami(args: argparse.Namespace) -> int:
    import os  # noqa: PLC0415

    from nomad_sdk.api import NomadClient  # noqa: PLC0415

    env = {**os.environ, **({'NOMAD_API_URL': args.api_url} if args.api_url else {})}
    me = NomadClient.from_env(env=env).users.get_me()
    print(f'{me.name} ({me.username}) — user_id {me.user_id}')
    return 0


def _playground_serve(args: argparse.Namespace) -> int:
    from nomad_sdk.playground import serve  # noqa: PLC0415

    serve(host=args.host, port=args.port, open_browser=not args.no_browser)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='nomad-sdk', description=__doc__)
    parser.add_argument('--version', action='version', version=__version__)
    sub = parser.add_subparsers(dest='command', required=True)

    who = sub.add_parser(
        'whoami', help='show the authenticated user (NOMAD_API_URL + NOMAD_PAT)'
    )
    who.add_argument('--api-url', help='API base URL or alias; overrides NOMAD_API_URL')
    who.set_defaults(func=_whoami)

    pg = sub.add_parser('playground', help='browser playground')
    pg_sub = pg.add_subparsers(dest='playground_command', required=True)
    srv = pg_sub.add_parser('serve', help='serve the playground locally')
    srv.add_argument('--host', default='127.0.0.1')
    srv.add_argument('--port', type=int, default=8765)
    srv.add_argument('--no-browser', action='store_true')
    srv.set_defaults(func=_playground_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    from nomad_sdk.exceptions import NomadSDKError  # noqa: PLC0415

    try:
        return args.func(args)
    except NomadSDKError as error:
        print(f'error: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
