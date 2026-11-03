"""Deployment URLs and environment-variable names shared by the client and identity.

Nothing here reads the environment at import time. The legacy package resolved
``NOMAD_USERNAME``/``NOMAD_PASSWORD`` when it was first imported, which forced
users to restart notebooks after editing credentials; the environment is now read
only by ``NomadClient.from_env`` and ``EnvironmentCredential`` when called.
"""

from __future__ import annotations

from nomad_sdk.exceptions import ConfigurationError

ENV_API_URL = 'NOMAD_API_URL'
ENV_PAT = 'NOMAD_PAT'
ENV_USERNAME = 'NOMAD_USERNAME'
ENV_PASSWORD = 'NOMAD_PASSWORD'
ENV_TIMEOUT = 'NOMAD_TIMEOUT'

DEFAULT_TIMEOUT_S = 60.0

#: Short names for the public NOMAD deployments. Values follow the URLs used in
#: nomad-docs (``howto/manage/program/auth.md``, ``tutorial/upload_publish_api.md``).
#: Keep this table as the single place to update when deployment URLs move.
DEPLOYMENTS: dict[str, str] = {
    'central': 'https://nomad-lab.eu/backend/api/v1',
    'test': 'https://nomad-lab.eu/test/backend/api/v1',
    'develop': 'https://nomad-lab.eu/develop/backend/api/v1',
}


def resolve_api_url(url_or_alias: str) -> str:
    """Return a full API v1 base URL for a deployment alias or an explicit URL.

    Unlike the legacy ``get_nomad_url``, there is no silent fallback to the test
    deployment: an empty value is a configuration error.
    """
    if not url_or_alias:
        raise ConfigurationError(
            f'No NOMAD API URL given. Pass api_url=... or set {ENV_API_URL}. '
            f'Known aliases: {", ".join(sorted(DEPLOYMENTS))}.'
        )
    url = DEPLOYMENTS.get(url_or_alias, url_or_alias).rstrip('/')
    if not url.startswith(('http://', 'https://')):
        raise ConfigurationError(
            f'{url_or_alias!r} is neither a known deployment alias '
            f'({", ".join(sorted(DEPLOYMENTS))}) nor an http(s) URL.'
        )
    if not url.endswith('/api/v1'):
        raise ConfigurationError(
            f'{url!r} does not look like a NOMAD API base URL; it must end in /api/v1.'
        )
    return url
