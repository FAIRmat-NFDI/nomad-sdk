"""Repository-wide pytest configuration.

Two tiers run the same tests, including the documentation examples
(``tests/docs/test_doc_examples.py`` runs every file in ``examples/docs/`` that a
``snippets: test`` page includes):

* **offline** (default, every PR): requests to ``MOCK_API_URL`` are answered by
  ``responses`` and credentials are fake.
* **live** (``NOMAD_SDK_LIVE=1``, nightly / manual): nothing is mocked;
  ``NOMAD_API_URL`` and ``NOMAD_PAT`` must point at a real deployment.
"""

import os

import pytest
import responses

from tests.support.nomad_mock import MOCK_API_URL, MOCK_PAT, register_nomad_mock

LIVE = os.environ.get('NOMAD_SDK_LIVE') == '1'


def pytest_collection_modifyitems(config, items):
    skip_live = pytest.mark.skip(reason='live tier disabled; set NOMAD_SDK_LIVE=1')
    for item in items:
        if 'live' in item.keywords and not LIVE:
            item.add_marker(skip_live)


@pytest.fixture
def nomad_mock():
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        register_nomad_mock(rsps)
        yield rsps


@pytest.fixture
def nomad_env(monkeypatch):
    """Point ``NomadClient.from_env()`` at the mock (offline) or keep env (live)."""
    if not LIVE:
        monkeypatch.setenv('NOMAD_API_URL', MOCK_API_URL)
        monkeypatch.setenv('NOMAD_PAT', MOCK_PAT)
        for var in ('NOMAD_USERNAME', 'NOMAD_PASSWORD'):
            monkeypatch.delenv(var, raising=False)
