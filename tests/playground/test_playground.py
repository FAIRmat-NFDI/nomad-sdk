import io
import json
import threading
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import pytest

from nomad_sdk.exceptions import ConfigurationError
from nomad_sdk.playground import make_server
from nomad_sdk.playground.bundle import EXAMPLES_PATH, generated_files

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def ui_build(tmp_path_factory):
    """Stand-in for the Vite build, so server tests don't need Node."""
    static = tmp_path_factory.mktemp('static')
    (static / 'index.html').write_text('<!doctype html><div id="root"></div>')
    (static / 'assets').mkdir()
    (static / 'assets' / 'index.js').write_text('console.log(1)')
    (static / 'examples.json').write_text('[]')
    return static


@pytest.fixture(scope='module')
def base_url(ui_build):
    server = make_server(port=0, static_dir=ui_build)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_address[1]}'
    server.shutdown()
    server.server_close()


def fetch(url: str) -> tuple[int, str, bytes]:
    with urllib.request.urlopen(url, timeout=5) as res:  # noqa: S310 — localhost
        return res.status, res.headers.get_content_type(), res.read()


@pytest.mark.parametrize('path', ['/', '/assets/index.js', '/examples.json'])
def test_static_assets_served(base_url, path):
    status, _, body = fetch(base_url + path)
    assert status == 200 and body


def test_client_routes_fall_back_to_index(base_url):
    status, ctype, body = fetch(base_url + '/workflow')
    assert (status, ctype) == (200, 'text/html')
    assert b'id="root"' in body


def test_missing_asset_is_still_404(base_url):
    with pytest.raises(urllib.error.HTTPError) as exc:
        fetch(base_url + '/assets/missing.js')
    assert exc.value.code == 404


def test_sdk_zip_contains_package_sources_only(base_url):
    status, ctype, body = fetch(base_url + '/sdk.zip')
    assert (status, ctype) == (200, 'application/zip')
    names = zipfile.ZipFile(io.BytesIO(body)).namelist()
    assert 'nomad_sdk/__init__.py' in names
    assert 'nomad_sdk/workflow/_engine.py' in names
    assert not [n for n in names if '/static/' in n or '__pycache__' in n]


def test_server_explains_missing_ui_build(tmp_path):
    with pytest.raises(ConfigurationError, match='npm run build:package'):
        make_server(port=0, static_dir=tmp_path)


def test_generated_playground_data_is_current():
    """examples.json and api.json in playground/public/ match the sources."""
    for path, content in generated_files(ROOT).items():
        assert path.read_text() == content, f'{path.name} stale; run bundle --update'
    assert json.loads((ROOT / EXAMPLES_PATH).read_text()), 'no tested examples found'


def test_api_reference_covers_the_public_api():
    from nomad_sdk.playground.reference import build_reference

    ref = build_reference(ROOT / 'src')
    paths = {m['path'] for p in ref['packages'] for m in p['members']}
    assert {
        'nomad_sdk.api.NomadClient',
        'nomad_sdk.identity.PersonalAccessTokenCredential',
        'nomad_sdk.exceptions.AuthenticationError',
    } <= paths
    client = next(
        m for p in ref['packages'] for m in p['members'] if m['name'] == 'NomadClient'
    )
    assert {'users', 'from_env'} <= {m['name'] for m in client['members']}
    assert client['parameters'][0]['description'].startswith('API v1 base URL')
