from __future__ import annotations

from typing import TYPE_CHECKING

from nomad_sdk.api.models import User

if TYPE_CHECKING:
    from nomad_sdk.api._transport import Transport


class UsersOperations:
    """``client.users`` — NOMAD user accounts.

    Do not instantiate directly; use :attr:`NomadClient.users`.
    """

    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def get_me(self) -> User:
        """Return the account the client's credential belongs to."""
        return User.model_validate(self._transport.send('GET', '/users/me').json())
