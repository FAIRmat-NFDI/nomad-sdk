"""Exception hierarchy. Catch :class:`NomadSDKError` to handle any SDK failure."""

from __future__ import annotations


class NomadSDKError(Exception):
    """Base class for all errors raised by nomad-sdk."""


class ConfigurationError(NomadSDKError):
    """Missing or invalid client configuration (URL, credentials, ...)."""


class CredentialUnavailableError(ConfigurationError):
    """A credential cannot be created, e.g. its environment variables are unset."""


class NomadAPIError(NomadSDKError):
    """The NOMAD API returned an unexpected status code."""

    def __init__(self, status_code: int, detail: object, *, url: str = '') -> None:
        self.status_code = status_code
        self.detail = detail
        self.url = url
        super().__init__(f'HTTP {status_code} from {url or "NOMAD API"}: {detail}')


class AuthenticationError(NomadAPIError):
    """HTTP 401: credentials missing, expired, revoked or for another deployment."""


class AuthorizationError(NomadAPIError):
    """HTTP 403: credentials are valid but lack the required scope or access."""
