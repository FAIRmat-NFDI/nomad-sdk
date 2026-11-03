"""Operation groups: one class per NOMAD resource, exposed as ``client.<group>``.

Each group only maps Python methods to endpoints and models; HTTP, auth and errors
live in the private transport. Naming follows the Azure SDK guidelines: ``get_*``,
``list_*``, ``create_*``, ``delete_*`` (and ``begin_*`` for long-running work).
"""

from nomad_sdk.api.operations._users import UsersOperations

__all__ = ['UsersOperations']
