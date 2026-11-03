"""YAML serialisation for workflow archives.

The legacy package registered its representers on the *global* ``yaml.Dumper``,
which silently changed ``yaml.dump`` output for every library in the process.
Here the same representers are scoped to a private ``Dumper`` subclass, so the
emitted YAML is byte-identical to the legacy output without the side effect.
"""

from collections import OrderedDict
from typing import IO, Any

import yaml


class SingleQuotedScalarString(str):
    """A string that is always emitted single-quoted."""


def _represent_single_quoted(dumper: yaml.Dumper, data: str) -> yaml.ScalarNode:
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style="'")


def _represent_ordereddict(dumper: yaml.Dumper, data: OrderedDict) -> yaml.Node:
    return dumper.represent_dict(data.items())


class WorkflowDumper(yaml.Dumper):
    """``yaml.Dumper`` with the representers the NOMAD workflow archive expects."""


WorkflowDumper.add_representer(SingleQuotedScalarString, _represent_single_quoted)
WorkflowDumper.add_representer(str, _represent_single_quoted)
WorkflowDumper.add_representer(OrderedDict, _represent_ordereddict)


def dump_yaml(data: Any, stream: IO[str], **kwargs: Any) -> None:
    """``yaml.dump`` using :class:`WorkflowDumper`."""
    yaml.dump(data, stream, Dumper=WorkflowDumper, **kwargs)
