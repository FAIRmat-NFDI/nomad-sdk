"""``nomad_sdk.api`` — a Python client library for NOMAD.

It wraps NOMAD's REST API the way ``boto3`` or the Azure SDKs wrap theirs: you work
with a client, operation groups and typed models, never with URLs or HTTP::

    from nomad_sdk import NomadClient
    from nomad_sdk.identity import PersonalAccessTokenCredential

    client = NomadClient('test', PersonalAccessTokenCredential(pat))
    me = client.users.get_me()

Credentials live in :mod:`nomad_sdk.identity`, errors in :mod:`nomad_sdk.exceptions`.
"""

from nomad_sdk.api._client import NomadClient
from nomad_sdk.api.models import User
from nomad_sdk.api.operations import UsersOperations

__all__ = ['NomadClient', 'User', 'UsersOperations']
