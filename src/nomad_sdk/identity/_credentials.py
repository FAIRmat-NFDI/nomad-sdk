"""Credential implementations. See :mod:`nomad_sdk.identity`."""

from __future__ import annotations

import math
import os
import time
from collections.abc import Mapping
from typing import NamedTuple, Protocol, runtime_checkable

import requests

from nomad_sdk.config import (
    DEFAULT_TIMEOUT_S,
    ENV_API_URL,
    ENV_PASSWORD,
    ENV_PAT,
    ENV_USERNAME,
    resolve_api_url,
)
from nomad_sdk.exceptions import AuthenticationError, CredentialUnavailableError

# Refresh password-grant tokens this many seconds before they expire.
_EXPIRY_SKEW_S = 30.0
# Used when /auth/token does not report ``expires_in``; matches the legacy cache.
_FALLBACK_TTL_S = 180.0


class AccessToken(NamedTuple):
    """A bearer token and when it expires (Unix time; ``inf`` = not known to expire)."""

    token: str
    expires_on: float


@runtime_checkable
class TokenCredential(Protocol):
    """Anything that can produce a bearer token for NOMAD."""

    def get_token(self) -> AccessToken: ...


class PersonalAccessTokenCredential:
    """A NOMAD personal access token (PAT), or any pre-issued bearer token.

    The recommended credential for scripts, notebooks and CI. Create a PAT in the
    NOMAD GUI (see nomad-docs ``howto/manage/program/auth.md``).
    """

    def __init__(self, token: str) -> None:
        if not token:
            raise ValueError('token must be a non-empty string')
        self._token = token

    def get_token(self) -> AccessToken:
        return AccessToken(self._token, math.inf)

    def __repr__(self) -> str:
        return 'PersonalAccessTokenCredential(token=***)'


class UsernamePasswordCredential:
    """Username and password, exchanged for a short-lived token on ``/auth/token``.

    Kept for users coming from ``nomad-utility-workflows``; prefer a PAT.

    Args:
        username: NOMAD username.
        password: NOMAD password.
        api_url: The deployment that issues the token (URL or alias such as
            ``test``); use the same deployment as the client.
    """

    def __init__(
        self,
        username: str,
        password: str,
        *,
        api_url: str,
        timeout: float = DEFAULT_TIMEOUT_S,
        session: requests.Session | None = None,
    ) -> None:
        if not username or not password:
            raise ValueError('username and password must be non-empty strings')
        self.username = username
        self._password = password
        self.api_url = resolve_api_url(api_url)
        self._timeout = timeout
        self._session = session or requests.Session()
        self._cached: AccessToken | None = None

    def get_token(self) -> AccessToken:
        if self._cached and time.time() < self._cached.expires_on - _EXPIRY_SKEW_S:
            return self._cached
        response = self._session.post(
            f'{self.api_url}/auth/token',
            data={
                'username': self.username,
                'password': self._password,
                'grant_type': 'password',
            },
            timeout=self._timeout,
        )
        payload = response.json() if response.content else {}
        token = payload.get('access_token') if isinstance(payload, dict) else None
        if response.status_code != 200 or not token:
            detail = (
                payload.get('detail', payload) if isinstance(payload, dict) else payload
            )
            raise AuthenticationError(
                response.status_code,
                detail or 'No access_token in response',
                url=response.url,
            )
        ttl = float(payload.get('expires_in') or _FALLBACK_TTL_S)
        self._cached = AccessToken(token, time.time() + ttl)
        return self._cached

    def __repr__(self) -> str:
        return (
            f'UsernamePasswordCredential(username={self.username!r}, password=***, '
            f'api_url={self.api_url!r})'
        )


class EnvironmentCredential:
    """Credential configured by environment variables, read when it is created.

    * ``NOMAD_PAT`` → :class:`PersonalAccessTokenCredential` (preferred);
    * otherwise ``NOMAD_USERNAME`` + ``NOMAD_PASSWORD`` →
      :class:`UsernamePasswordCredential` on ``api_url`` or ``NOMAD_API_URL``.

    Raises:
        CredentialUnavailableError: none of the variables is set.
    """

    def __init__(
        self, *, api_url: str | None = None, env: Mapping[str, str] | None = None
    ) -> None:
        env = os.environ if env is None else env
        self._inner: TokenCredential
        if env.get(ENV_PAT):
            self._inner = PersonalAccessTokenCredential(env[ENV_PAT])
        elif env.get(ENV_USERNAME) and env.get(ENV_PASSWORD):
            self._inner = UsernamePasswordCredential(
                env[ENV_USERNAME],
                env[ENV_PASSWORD],
                api_url=api_url or env.get(ENV_API_URL, ''),
            )
        else:
            raise CredentialUnavailableError(
                f'EnvironmentCredential: set {ENV_PAT} (or {ENV_USERNAME} and '
                f'{ENV_PASSWORD}).'
            )

    def get_token(self) -> AccessToken:
        return self._inner.get_token()

    def __repr__(self) -> str:
        return f'EnvironmentCredential({self._inner!r})'
