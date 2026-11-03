"""Private HTTP transport: one ``requests.Session``, bearer auth, error mapping.

Not part of the public API. Operation groups call :meth:`Transport.send`; users call
typed methods such as ``client.users.get_me()`` and never build URLs or requests.
"""

from __future__ import annotations

from typing import Any

import requests

from nomad_sdk import __version__
from nomad_sdk.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConfigurationError,
    NomadAPIError,
)
from nomad_sdk.identity import TokenCredential


class Transport:
    def __init__(
        self,
        api_url: str,
        credential: TokenCredential | None,
        *,
        timeout: float,
        session: requests.Session | None,
    ) -> None:
        self.api_url = api_url
        self.credential = credential
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers.setdefault('User-Agent', f'nomad-sdk/{__version__}')

    def send(
        self,
        method: str,
        path: str,
        *,
        authenticated: bool = True,
        expected: tuple[int, ...] = (200,),
        **kwargs: Any,
    ) -> requests.Response:
        headers = dict(kwargs.pop('headers', None) or {})
        if authenticated:
            if self.credential is None:
                raise ConfigurationError(
                    'This operation needs authentication but the client has no '
                    'credential. Pass credential=... (see nomad_sdk.identity).'
                )
            headers['Authorization'] = f'Bearer {self.credential.get_token().token}'
        kwargs.setdefault('timeout', self.timeout)
        response = self.session.request(
            method, f'{self.api_url}/{path.lstrip("/")}', headers=headers, **kwargs
        )
        if response.status_code not in expected:
            raise _error_for(response)
        return response

    def close(self) -> None:
        self.session.close()


def _error_for(response: requests.Response) -> NomadAPIError:
    try:
        body = response.json()
        detail = body.get('detail', body) if isinstance(body, dict) else body
    except ValueError:
        detail = response.text[:500]
    error_cls = {401: AuthenticationError, 403: AuthorizationError}.get(
        response.status_code, NomadAPIError
    )
    return error_cls(response.status_code, detail, url=response.url)
