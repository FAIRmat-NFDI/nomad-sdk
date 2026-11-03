"""``nomad_sdk.playground`` — run SDK examples in the browser via Pyodide.

The UI is the React + MUI app in ``playground/`` (repo root), built into
``static/``. ``nomad-sdk playground serve`` hosts it locally; the same build is
published to GitHub Pages by ``.github/workflows/playground.yml``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from http.server import ThreadingHTTPServer
    from pathlib import Path


def make_server(
    host: str = '127.0.0.1', port: int = 8765, static_dir: Path | None = None
) -> ThreadingHTTPServer:
    from nomad_sdk.playground.server import make_server as _make  # noqa: PLC0415

    return _make(host, port) if static_dir is None else _make(host, port, static_dir)


def serve(host: str = '127.0.0.1', port: int = 8765, open_browser: bool = True) -> None:
    from nomad_sdk.playground.server import serve as _serve  # noqa: PLC0415

    _serve(host, port, open_browser)


__all__ = ['make_server', 'serve']
