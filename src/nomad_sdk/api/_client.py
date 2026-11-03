from __future__ import annotations

from collections.abc import Mapping

import requests

from nomad_sdk.api._transport import Transport
from nomad_sdk.api.operations import UsersOperations
from nomad_sdk.config import (
    DEFAULT_TIMEOUT_S,
    ENV_API_URL,
    ENV_TIMEOUT,
    resolve_api_url,
)
from nomad_sdk.identity import EnvironmentCredential, TokenCredential


class NomadClient:
    """Client for one NOMAD deployment.

    Operations are grouped by resource: ``client.users`` today; ``uploads``,
    ``entries`` and ``datasets`` follow. Methods return typed models from
    :mod:`nomad_sdk.api.models` and raise :mod:`nomad_sdk.exceptions` errors.

    Args:
        api_url: API v1 base URL, or a deployment alias (``central``, ``test``,
            ``develop``).
        credential: Any :class:`~nomad_sdk.identity.TokenCredential`, e.g.
            :class:`~nomad_sdk.identity.PersonalAccessTokenCredential`. Omit it
            for anonymous access to public data.
        timeout: Per-request timeout in seconds.
        session: Optional pre-configured ``requests.Session`` (proxies, retries).
    """

    def __init__(
        self,
        api_url: str,
        credential: TokenCredential | None = None,
        *,
        timeout: float = DEFAULT_TIMEOUT_S,
        session: requests.Session | None = None,
    ) -> None:
        self._transport = Transport(
            resolve_api_url(api_url), credential, timeout=timeout, session=session
        )
        self.users: UsersOperations = UsersOperations(self._transport)
        """Operations on NOMAD user accounts."""

    @classmethod
    def from_env(
        cls,
        *,
        credential: TokenCredential | None = None,
        env: Mapping[str, str] | None = None,
    ) -> NomadClient:
        """Client for ``NOMAD_API_URL``, with an :class:`EnvironmentCredential`
        unless ``credential`` is given. The environment is read at call time."""
        import os  # noqa: PLC0415

        env = os.environ if env is None else env
        api_url = env.get(ENV_API_URL, '')
        timeout = float(env.get(ENV_TIMEOUT, DEFAULT_TIMEOUT_S))
        if credential is None:
            credential = EnvironmentCredential(api_url=api_url or None, env=env)
        return cls(api_url, credential, timeout=timeout)

    @property
    def api_url(self) -> str:
        return self._transport.api_url

    @property
    def credential(self) -> TokenCredential | None:
        return self._transport.credential

    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> NomadClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def __repr__(self) -> str:
        return f'NomadClient(api_url={self.api_url!r}, credential={self.credential!r})'
