import pytest

from nomad_sdk import NomadClient
from nomad_sdk.api import User
from nomad_sdk.config import DEPLOYMENTS, resolve_api_url
from nomad_sdk.exceptions import (
    AuthenticationError,
    ConfigurationError,
    CredentialUnavailableError,
)
from nomad_sdk.identity import (
    EnvironmentCredential,
    PersonalAccessTokenCredential,
    TokenCredential,
    UsernamePasswordCredential,
)
from tests.support.nomad_mock import MOCK_API_URL, MOCK_PAT


def test_import_does_not_read_environment(monkeypatch):
    import importlib

    import nomad_sdk

    monkeypatch.delenv('NOMAD_USERNAME', raising=False)
    monkeypatch.delenv('NOMAD_PASSWORD', raising=False)
    importlib.reload(nomad_sdk)  # legacy raised UndefinedValueError here


@pytest.mark.parametrize('alias', sorted(DEPLOYMENTS))
def test_aliases_resolve(alias):
    assert resolve_api_url(alias) == DEPLOYMENTS[alias]


@pytest.mark.parametrize(
    'bad', ['', 'prod', 'ftp://x/api/v1', 'https://nomad-lab.eu/backend']
)
def test_bad_urls_rejected(bad):
    with pytest.raises(ConfigurationError):
        resolve_api_url(bad)


def test_public_surface_has_no_raw_http():
    client = NomadClient(MOCK_API_URL)
    for name in ('request', 'get', 'post', 'delete', 'put'):
        assert not hasattr(client, name)


def test_get_me_with_pat(nomad_mock):
    client = NomadClient(MOCK_API_URL, PersonalAccessTokenCredential(MOCK_PAT))
    me = client.users.get_me()
    assert isinstance(me, User) and me.username == 'ada'


def test_password_credential_caches_token(nomad_mock):
    credential = UsernamePasswordCredential('ada', 'pw', api_url=MOCK_API_URL)
    client = NomadClient(MOCK_API_URL, credential)
    client.users.get_me()
    client.users.get_me()
    token_calls = [c for c in nomad_mock.calls if c.request.url.endswith('/auth/token')]
    assert len(token_calls) == 1  # token cached until expiry


def test_bad_token_maps_to_authentication_error(nomad_mock):
    client = NomadClient(MOCK_API_URL, PersonalAccessTokenCredential('wrong'))
    with pytest.raises(AuthenticationError) as exc:
        client.users.get_me()
    assert exc.value.status_code == 401


def test_environment_credential_prefers_pat(nomad_mock):
    env = {
        'NOMAD_API_URL': MOCK_API_URL,
        'NOMAD_PAT': MOCK_PAT,
        'NOMAD_USERNAME': 'ada',
        'NOMAD_PASSWORD': 'pw',
    }
    client = NomadClient.from_env(env=env)
    assert client.users.get_me().username == 'ada'
    assert not any(c.request.url.endswith('/auth/token') for c in nomad_mock.calls)


def test_environment_credential_unavailable():
    with pytest.raises(CredentialUnavailableError):
        EnvironmentCredential(env={})


def test_credentials_are_protocol_compatible_and_hide_secrets():
    pat = PersonalAccessTokenCredential('secret')
    pw = UsernamePasswordCredential('ada', 'secret', api_url='test')
    assert isinstance(pat, TokenCredential) and isinstance(pw, TokenCredential)
    assert 'secret' not in repr(pat) + repr(pw)


def test_anonymous_client_refuses_authenticated_operations():
    with pytest.raises(ConfigurationError):
        NomadClient(MOCK_API_URL).users.get_me()


@pytest.mark.live
def test_live_get_me():
    assert NomadClient.from_env().users.get_me().user_id
