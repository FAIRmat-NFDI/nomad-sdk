"""``nomad_sdk.identity`` — credentials for NOMAD, in the style of ``azure.identity``.

A credential is any object with ``get_token() -> AccessToken``. Clients only ever ask
a credential for a token; how the token is obtained (a personal access token, the
Keycloak password grant, environment variables) is the credential's business::

    from nomad_sdk import NomadClient
    from nomad_sdk.identity import EnvironmentCredential

    client = NomadClient('test', credential=EnvironmentCredential())

Nothing here reads the environment or the network at import time.
"""

from nomad_sdk.identity._credentials import (
    AccessToken,
    EnvironmentCredential,
    PersonalAccessTokenCredential,
    TokenCredential,
    UsernamePasswordCredential,
)

__all__ = [
    'AccessToken',
    'EnvironmentCredential',
    'PersonalAccessTokenCredential',
    'TokenCredential',
    'UsernamePasswordCredential',
]
