"""Documentation examples are files: the docs include them, and this test runs them.

Pages marked ``snippets: test`` in ``docs-sync.yaml`` show Python only through
``--8<-- "examples/docs/…"`` includes, so the code a reader sees is exactly the code
executed here (offline against the mock API; live with ``NOMAD_SDK_LIVE=1``).
"""

import runpy
from pathlib import Path

import pytest

from conftest import LIVE
from nomad_sdk.playground.bundle import doc_examples

ROOT = Path(__file__).parents[2]
EXAMPLES, PROBLEMS = doc_examples(ROOT)


def test_tested_pages_use_example_files_only():
    assert not PROBLEMS, '\n'.join(PROBLEMS)


def test_every_example_file_is_shown_in_the_docs():
    shown = {ex['file'] for ex in EXAMPLES}
    files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'examples/docs/sdk').glob('*.py')}
    assert files <= shown, f'not included by any tested page: {sorted(files - shown)}'


@pytest.mark.parametrize('example', EXAMPLES, ids=[ex['file'] for ex in EXAMPLES])
def test_example_runs(example, request, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # examples may write files (workflow.archive.yaml)
    if not LIVE:
        request.getfixturevalue('nomad_env')
        request.getfixturevalue('nomad_mock')
    runpy.run_path(str(ROOT / example['file']), run_name='__main__')
