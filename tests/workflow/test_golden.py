"""Parity: the ported engine must emit byte-identical YAML to nomad-utility-workflows.

Golden files in ``golden/`` were produced by the legacy implementation from the
specs in ``specs.py``. Regenerate them only on an intentional output change.
"""

import io
from pathlib import Path

import pytest
import yaml

from nomad_sdk.workflow import NodeAttributes, NodeAttributesUniverse, NomadWorkflow
from tests.workflow.specs import SPECS

GOLDEN = Path(__file__).parent / 'golden'


@pytest.mark.parametrize('name', sorted(SPECS))
def test_output_matches_legacy(name, tmp_path):
    universe = SPECS[name](NodeAttributes, NodeAttributesUniverse)
    out = tmp_path / f'{name}.archive.yaml'
    NomadWorkflow(
        node_attributes_universe=universe, destination_filename=str(out), name=name
    ).build_workflow_yaml()
    assert out.read_text() == (GOLDEN / f'{name}.archive.yaml').read_text()


def test_import_has_no_global_yaml_side_effects():
    import nomad_sdk.workflow  # noqa: F401

    buf = io.StringIO()
    yaml.dump({'a': 'b'}, buf)
    assert buf.getvalue() == 'a: b\n'  # legacy package emitted "'a': 'b'"
