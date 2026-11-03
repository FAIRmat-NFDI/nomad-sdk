"""nomad-sdk: Python SDK for the NOMAD platform.

Subpackages:

* ``nomad_sdk.api`` — Python client library for NOMAD (``NomadClient``, operation
  groups, typed models); wraps the REST API, which callers never touch directly.
* ``nomad_sdk.identity`` — credentials (``PersonalAccessTokenCredential``, …).
* ``nomad_sdk.workflow`` — build custom-workflow archives.
* ``nomad_sdk.playground`` — the browser playground and its local server.

Import cost is kept low: ``import nomad_sdk`` does not import ``networkx`` or
touch the network or the environment. Heavy subpackages load on first access.
"""

from importlib import import_module
from importlib.metadata import PackageNotFoundError, version
from typing import TYPE_CHECKING, Any

try:
    __version__ = version('nomad-sdk')
except PackageNotFoundError:  # running from a source tree / Pyodide zip import
    __version__ = '0.0.0+unknown'

if TYPE_CHECKING:
    from nomad_sdk import api, identity, workflow
    from nomad_sdk.api import NomadClient

_LAZY = {
    'NomadClient': ('nomad_sdk.api', 'NomadClient'),
    'api': ('nomad_sdk.api', None),
    'identity': ('nomad_sdk.identity', None),
    'workflow': ('nomad_sdk.workflow', None),
}

__all__ = ['NomadClient', '__version__', 'api', 'identity', 'workflow']


def __getattr__(name: str) -> Any:
    try:
        module_name, attr = _LAZY[name]
    except KeyError:
        raise AttributeError(f'module {__name__!r} has no attribute {name!r}') from None
    module = import_module(module_name)
    value = getattr(module, attr) if attr else module
    globals()[name] = value
    return value
