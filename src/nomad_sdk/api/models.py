"""Response models. Unknown fields are ignored so API additions never break clients."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NomadModel(BaseModel):
    model_config = ConfigDict(extra='ignore', frozen=True)


class User(NomadModel):
    """A NOMAD account (``client.users``)."""

    user_id: str
    name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    email: str | None = None
    affiliation: str | None = None
    affiliation_address: str | None = None
    is_admin: bool | None = None
    is_oasis_admin: bool | None = None
    created: datetime | None = None
