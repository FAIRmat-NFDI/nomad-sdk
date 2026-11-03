"""Runs the snippets of examples/tutorial-workflows/README.md, offline."""

import json
import re
from pathlib import Path

README = Path(__file__).parents[2] / 'examples' / 'tutorial-workflows' / 'README.md'
FENCE = re.compile(r'^```(\w+)\n(.*?)^```$', re.M | re.S)


def test_project_workflow_snippet(tmp_path, monkeypatch):
    fences = FENCE.findall(README.read_text())
    template = json.loads(next(body for lang, body in fences if lang == 'json'))
    ids = iter(f'ID{i:02d}' for i in range(100))
    pids = {
        kind: {
            k: [next(ids) for _ in v] if isinstance(v, list) else next(ids)
            for k, v in d.items()
        }
        for kind, d in template.items()
    }
    (tmp_path / 'PIDs.json').write_text(json.dumps(pids))
    monkeypatch.chdir(tmp_path)

    exec('\n'.join(body for lang, body in fences if lang == 'python'), {})

    out = (tmp_path / 'project_workflow.archive.yaml').read_text()
    assert 'NOMAD Tutorial Workflows Project' in out
    uploads, entries = pids['upload_ids'], pids['entry_ids']
    assert (
        f'../uploads/{uploads["analysis"]}/archive/{entries["analysis"]}#/data' in out
    )
    for entry in entries['DFT']:
        assert f'../uploads/{uploads["DFT"]}/archive/{entry}#/' in out
    assert '../upload/archive/mainfile/' not in out  # every reference crosses uploads
