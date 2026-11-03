"""Self-hosted playground: serve the built UI plus ``sdk.zip`` from this install.

Standard library only, so ``pip install nomad-sdk`` is enough to run it. Binds
to localhost by default; the server never sees credentials (they stay in the
browser tab and go straight to the NOMAD API).
"""

from __future__ import annotations

import functools
import posixpath
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from nomad_sdk.exceptions import ConfigurationError
from nomad_sdk.playground.bundle import STATIC_DIR, build_sdk_zip


class _Handler(SimpleHTTPRequestHandler):
    sdk_zip: bytes = b''

    def do_GET(self) -> None:
        if self.path.split('?', 1)[0] == '/sdk.zip':
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Length', str(len(self.sdk_zip)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(self.sdk_zip)
            return
        # SPA fallback: client routes (e.g. /workflow) get index.html.
        route = self.path.split('?', 1)[0]
        if (
            not posixpath.splitext(route)[1]
            and not Path(self.translate_path(route)).exists()
        ):
            self.path = '/index.html'
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass  # keep the terminal quiet; errors still surface in the browser


def make_server(
    host: str = '127.0.0.1', port: int = 8765, static_dir: Path = STATIC_DIR
) -> ThreadingHTTPServer:
    if not (static_dir / 'index.html').is_file():
        raise ConfigurationError(
            f'Playground UI not found in {static_dir}. Install a released wheel, or '
            'build it from the repo: cd playground && npm ci && npm run build:package'
        )
    handler = functools.partial(_Handler, directory=str(static_dir))
    _Handler.sdk_zip = build_sdk_zip()
    return ThreadingHTTPServer((host, port), handler)


def serve(host: str = '127.0.0.1', port: int = 8765, open_browser: bool = True) -> None:
    server = make_server(host, port)
    url = f'http://{host}:{server.server_address[1]}/'
    print(f'nomad-sdk playground running at {url}  (Ctrl+C to stop)')
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
