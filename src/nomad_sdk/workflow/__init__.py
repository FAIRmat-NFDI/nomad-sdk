"""``nomad_sdk.workflow`` — build NOMAD custom-workflow archives.

The current public API is the engine ported from ``nomad-utility-workflows``:
describe nodes with :class:`NodeAttributes`, turn them into a graph with
:func:`nodes_to_graph`, and let :class:`NomadWorkflow` fill default inputs/outputs
and write ``workflow.archive.yaml``.

A higher-level, object-oriented builder is planned for a later milestone; it will
compile down to this engine, so code written against these names keeps working.
"""

from nomad_sdk.workflow._archive import (
    NomadSection,
    NomadTask,
    NomadWorkflowArchive,
    PathInfo,
)
from nomad_sdk.workflow._engine import NomadWorkflow
from nomad_sdk.workflow._graph import (
    NodeAttributes,
    NodeAttributesUniverse,
    nodes_to_graph,
)

__all__ = [
    'NodeAttributes',
    'NodeAttributesUniverse',
    'NomadSection',
    'NomadTask',
    'NomadWorkflow',
    'NomadWorkflowArchive',
    'PathInfo',
    'nodes_to_graph',
]
