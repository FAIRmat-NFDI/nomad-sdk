"""The JSON contract used by the playground must produce exactly the legacy YAML."""

import json
from pathlib import Path

import pytest

from nomad_sdk.workflow import NodeAttributes, NodeAttributesUniverse
from nomad_sdk.workflow.spec import WorkflowSpec, generate, generate_json
from tests.workflow.specs import SPECS

GOLDEN = Path(__file__).parent / 'golden'


def spec_from_universe(name: str, universe: NodeAttributesUniverse) -> dict:
    """Translate the docs' NodeAttributes form into the playground's node/edge form."""
    nodes, edges = [], set()
    for key, attrs in universe.nodes.items():
        path_info = attrs.path_info or {}
        nodes.append(
            {
                'id': key,
                'name': attrs.name,
                'type': attrs.type,
                'entry_type': attrs.entry_type,
                'mainfile_path': path_info.get('mainfile_path'),
                'section_type': path_info.get('section_type'),
                'archive_path': path_info.get('archive_path')
                if attrs.type != 'workflow'
                else None,
            }
        )
        edges |= {(src, key) for src in attrs.in_edge_nodes}
        edges |= {(key, dst) for dst in attrs.out_edge_nodes}
    return {
        'name': name,
        'nodes': nodes,
        'edges': [{'source': s, 'target': t} for s, t in sorted(edges)],
    }


def test_md_equilibration_matches_legacy_yaml():
    universe = SPECS['md_equilibration'](NodeAttributes, NodeAttributesUniverse)
    result = generate(spec_from_universe('md_equilibration', universe))
    assert result.yaml == (GOLDEN / 'md_equilibration.archive.yaml').read_text()


def test_filled_graph_carries_engine_defaults():
    universe = SPECS['md_equilibration'](NodeAttributes, NodeAttributesUniverse)
    result = generate(spec_from_universe('md_equilibration', universe))
    user = {n.id for n in result.nodes if not n.default}
    assert user == {0, 1, 2, 3, 4, 5}
    assert any(n.default and n.type == 'output' for n in result.nodes)
    edge = next(e for e in result.edges if (e.source, e.target) == (1, 2))
    assert edge.inputs or edge.outputs  # default system/calculation links were added


def test_local_files_only_yields_same_upload_references():
    result = generate(
        {
            'name': 'two steps',
            'nodes': [
                {
                    'id': 0,
                    'name': 'A',
                    'type': 'workflow',
                    'entry_type': 'simulation',
                    'mainfile_path': 'a/run.log',
                },
                {
                    'id': 1,
                    'name': 'B',
                    'type': 'workflow',
                    'entry_type': 'simulation',
                    'mainfile_path': 'b/run.log',
                },
            ],
            'edges': [{'source': 0, 'target': 1}],
        }
    )
    assert "'../upload/archive/mainfile/a/run.log#/workflow2'" in result.yaml
    assert '../uploads/' not in result.yaml  # no upload/entry ids → no API needed


@pytest.mark.parametrize(
    ('spec', 'message'),
    [
        ({'name': 'x', 'nodes': []}, 'nodes'),
        (
            {
                'name': 'x',
                'nodes': [{'id': 0, 'name': 'a', 'type': 'task'}],
                'edges': [{'source': 0, 'target': 9}],
            },
            'unknown node',
        ),
        ({'name': 'x', 'nodes': [{'id': 0, 'name': 'a', 'type': 'banana'}]}, 'type'),
    ],
)
def test_generate_json_reports_errors(spec, message):
    out = json.loads(generate_json(json.dumps(spec)))
    assert out['ok'] is False
    assert any(message in e for e in out['errors'])


def test_generate_json_round_trip():
    spec = {
        'name': 'one',
        'nodes': [{'id': 0, 'name': 'A', 'type': 'task', 'mainfile_path': 'a.log'}],
    }
    out = json.loads(generate_json(json.dumps(spec)))
    assert out['ok'] is True and out['yaml'].startswith("'workflow2':")
    WorkflowSpec.model_validate(spec)


def test_section_index_is_passed_to_the_engine():
    def spec(index):
        node = {'id': 0, 'name': 'in', 'type': 'input', 'section_type': 'system'}
        if index is not None:
            node['section_index'] = index
        return {
            'name': 'x',
            'nodes': [
                node,
                {
                    'id': 1,
                    'name': 'A',
                    'type': 'workflow',
                    'entry_type': 'simulation',
                    'mainfile_path': 'a/run.log',
                },
            ],
            'edges': [{'source': 0, 'target': 1}],
        }

    default, first = generate(spec(None)).yaml, generate(spec(0)).yaml
    assert "a/run.log#/run/0/system/-1'" in default.split("'tasks'")[0]
    assert "a/run.log#/run/0/system/0'" in first.split("'tasks'")[0]
