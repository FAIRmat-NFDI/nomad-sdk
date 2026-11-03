"""JSON contract for building a workflow archive from a plain node/edge description.

This is what the browser playground calls through Pyodide (WebAssembly) — there is
no backend: the same engine that the Python API and the docs use produces the YAML.
It is also usable directly from Python or any client that speaks JSON.

    spec = {
        'name': 'Equilibration',
        'nodes': [
            {'id': 0, 'name': 'input system', 'type': 'input',
             'mainfile_path': 'Emin/mdrun_Emin.log', 'section_type': 'system'},
            {'id': 1, 'name': 'Geometry optimization', 'type': 'workflow',
             'entry_type': 'simulation', 'mainfile_path': 'Emin/mdrun_Emin.log'},
        ],
        'edges': [{'source': 0, 'target': 1}],
    }
    result = generate(spec)          # -> Generated(yaml=..., graph=..., warnings=[...])

Edges are converted to the ``in_edge_nodes`` / ``out_edge_nodes`` of
:class:`~nomad_sdk.workflow.NodeAttributes` using the convention of the
nomad-utility-workflows docs: an edge leaving an *input* node is stored on that
input (``out_edge_nodes``), every other edge on its target (``in_edge_nodes``).
That matters because a node without a mainfile inherits it along those edges.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from nomad_sdk.workflow._engine import NomadWorkflow
from nomad_sdk.workflow._graph import NodeAttributes, NodeAttributesUniverse
from nomad_sdk.workflow._yaml import dump_yaml

NodeType = Literal['input', 'task', 'workflow', 'output']


class NodeSpec(BaseModel):
    model_config = ConfigDict(extra='forbid')

    id: int = Field(ge=0, description='Unique node key.')
    name: str = Field(min_length=1)
    type: NodeType
    entry_type: Literal['simulation'] | None = None
    mainfile_path: str | None = Field(
        None, description='Path of the mainfile relative to the upload root.'
    )
    archive_path: str | None = Field(
        None, description='Full archive path, e.g. "data" or "run/0/system/-1".'
    )
    section_type: str | None = Field(
        None, description='Section name for inputs/outputs, e.g. "system".'
    )
    section_index: int | None = Field(
        None,
        description='Index into the section list; omitted = engine default -1 (last), '
        'as in the NOMAD docs. 0 = first.',
    )
    upload_id: str | None = None
    entry_id: str | None = None


class EdgeSpec(BaseModel):
    model_config = ConfigDict(extra='forbid')

    source: int
    target: int


class WorkflowSpec(BaseModel):
    model_config = ConfigDict(extra='forbid')

    name: str = Field(min_length=1)
    nodes: list[NodeSpec] = Field(min_length=1)
    edges: list[EdgeSpec] = Field(default_factory=list)

    @model_validator(mode='after')
    def _check_graph(self) -> WorkflowSpec:
        ids = [n.id for n in self.nodes]
        if len(set(ids)) != len(ids):
            raise ValueError('node ids must be unique')
        known = set(ids)
        for e in self.edges:
            if e.source not in known or e.target not in known:
                raise ValueError(
                    f'edge {e.source}->{e.target} references an unknown node'
                )
            if e.source == e.target:
                raise ValueError(f'edge {e.source}->{e.target} is a self-loop')
        return self


class GraphNode(BaseModel):
    id: int
    name: str | None
    type: str | None
    mainfile_path: str | None = None
    default: bool = Field(
        False,
        description='Added by the engine (default input/output), not by the user.',
    )


class GraphEdge(BaseModel):
    source: int
    target: int
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class Generated(BaseModel):
    """Result: the archive YAML plus the *filled* graph (with engine defaults)."""

    yaml: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    warnings: list[str] = Field(default_factory=list)


def to_node_attributes(spec: WorkflowSpec) -> NodeAttributesUniverse:
    by_id = {n.id: n for n in spec.nodes}
    in_edges: dict[int, list[int]] = {n.id: [] for n in spec.nodes}
    out_edges: dict[int, list[int]] = {n.id: [] for n in spec.nodes}
    for e in spec.edges:
        if by_id[e.source].type == 'input':
            out_edges[e.source].append(e.target)
        else:
            in_edges[e.target].append(e.source)

    nodes: dict[int, NodeAttributes] = {}
    for n in spec.nodes:
        path_info = {
            k: v
            for k, v in {
                'mainfile_path': n.mainfile_path,
                'archive_path': n.archive_path,
                'section_type': n.section_type,
                'upload_id': n.upload_id,
                'entry_id': n.entry_id,
            }.items()
            if v
        }
        if n.section_index is not None:  # 0 is a valid index
            path_info['section_index'] = n.section_index
        attrs: dict[str, Any] = {'name': n.name, 'type': n.type}
        if n.entry_type:
            attrs['entry_type'] = n.entry_type
        if path_info:
            attrs['path_info'] = path_info
        if in_edges[n.id]:
            attrs['in_edge_nodes'] = in_edges[n.id]
        if out_edges[n.id]:
            attrs['out_edge_nodes'] = out_edges[n.id]
        nodes[n.id] = NodeAttributes(**attrs)
    return NodeAttributesUniverse(nodes=nodes)


class _Collect(logging.Handler):
    def __init__(self) -> None:
        super().__init__(logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


def generate(spec: WorkflowSpec | dict[str, Any]) -> Generated:
    """Build the workflow archive for ``spec`` (same steps as build_workflow_yaml)."""
    spec = spec if isinstance(spec, WorkflowSpec) else WorkflowSpec.model_validate(spec)
    collector = _Collect()
    engine_logger = logging.getLogger('nomad_sdk.workflow')
    engine_logger.addHandler(collector)
    try:
        workflow = NomadWorkflow(
            node_attributes_universe=to_node_attributes(spec), name=spec.name
        )
        for key, attrs in workflow.workflow_graph.nodes(data=True):
            workflow.register_section(key, attrs)
        archive = workflow.generate_archive()
        archive.remove_duplicate_ios()
        buf = io.StringIO()
        dump_yaml(
            archive.to_dict(),
            buf,
            default_flow_style=False,
            allow_unicode=True,
            width=80,
        )
    finally:
        engine_logger.removeHandler(collector)

    graph = workflow.workflow_graph
    user_ids = {n.id for n in spec.nodes}
    nodes = [
        GraphNode(
            id=key,
            name=attrs.get('name'),
            type=attrs.get('type'),
            mainfile_path=(attrs.get('path_info') or {}).get('mainfile_path') or None,
            default=key not in user_ids,
        )
        for key, attrs in graph.nodes(data=True)
    ]
    edges = [
        GraphEdge(
            source=s,
            target=t,
            inputs=[io_.get('name', '') for io_ in data.get('inputs', [])],
            outputs=[io_.get('name', '') for io_ in data.get('outputs', [])],
        )
        for s, t, data in graph.edges(data=True)
    ]
    return Generated(
        yaml=buf.getvalue(), nodes=nodes, edges=edges, warnings=collector.messages
    )


def generate_json(spec_json: str) -> str:
    """String-in/string-out entry point for the browser (avoids JS↔Python proxies).

    Returns ``{"ok": true, ...Generated}`` or ``{"ok": false, "errors": [...]}``.
    """
    try:
        result = generate(json.loads(spec_json))
    except ValidationError as err:
        errors = [
            f'{".".join(str(p) for p in e["loc"]) or "spec"}: {e["msg"]}'
            for e in err.errors()
        ]
        return json.dumps({'ok': False, 'errors': errors})
    except Exception as err:  # noqa: BLE001 — surfaced to the user verbatim
        return json.dumps({'ok': False, 'errors': [f'{type(err).__name__}: {err}']})
    return json.dumps({'ok': True, **result.model_dump()})
