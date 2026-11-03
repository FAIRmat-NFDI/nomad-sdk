"""Build the artefacts the browser playground loads.

The playground UI is a React + MUI app in ``playground/`` (repo root). Its Vite
build is the static part; it has two hosts:

* ``nomad-sdk playground serve`` — serves ``nomad_sdk/playground/static/`` (the
  build, created by ``npm run build:package`` before the wheel is built).
* GitHub Pages — ``python -m nomad_sdk.playground.bundle --out site --static
  playground/dist`` adds the Python artefacts to a Pages build.

Next to ``index.html`` both serve:

* ``sdk.zip``        — the ``nomad_sdk`` sources, unpacked into Pyodide.
* ``examples.json``  — the Python examples of the docs pages marked
  ``snippets: test`` in ``docs-sync.yaml``. Those pages include each example from
  a file (``--8<-- "examples/docs/…"``) and CI runs the same files, so every example
  in the playground is one that CI has executed. Copy: ``playground/public/``.
* ``api.json``       — the API reference shown at /api, generated from docstrings and
  signatures (:mod:`nomad_sdk.playground.reference`). Copy: ``playground/public/``.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent.parent  # .../nomad_sdk
STATIC_DIR = Path(__file__).resolve().parent / 'static'  # Vite build output
EXAMPLES_PATH = Path('playground') / 'public' / 'examples.json'  # repo-relative
API_PATH = Path('playground') / 'public' / 'api.json'  # repo-relative

_FENCE = re.compile(r'^```(\S*)\n(.*?)^```\s*$', re.M | re.S)
_HEADING = re.compile(r'^#{1,6}\s+(.+?)\s*$', re.M)
# --8<-- "examples/docs/sdk/x.py"  (pymdownx.snippets, paths from the repo root)
_INCLUDE = re.compile(r'^\s*-{2}8<-{2}\s+"([^"]+)"\s*$')


def build_sdk_zip(package_dir: Path = PACKAGE_DIR) -> bytes:
    """Zip ``nomad_sdk`` (sources only) so Pyodide can unpack it onto sys.path."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(package_dir.rglob('*')):
            rel = path.relative_to(package_dir.parent)
            if path.is_dir() or '__pycache__' in rel.parts:
                continue
            if STATIC_DIR in path.parents:
                continue
            zf.write(path, rel.as_posix())
    return buf.getvalue()


def _fence_lang(info: str) -> tuple[str, set[str]]:
    info = info.strip()
    if info.startswith('{'):
        parts = info.strip('{}').split()
        lang = next((p[1:] for p in parts if p.startswith('.')), '')
        return lang, {p.lstrip('.') for p in parts} - {lang}
    parts = info.split()
    return (parts[0] if parts else ''), set(parts[1:])


def page_examples(page: Path, page_id: str) -> tuple[list[dict], list[str]]:
    """Python examples of one page as ``{title, page, file}``, plus problems.

    In a tested page every ``python`` fence must consist of ``--8<--`` includes only
    (one source for docs and CI); ``{.python notest}`` fences are exempt.
    """
    text = page.read_text()
    headings = [(m.start(), m.group(1)) for m in _HEADING.finditer(text)]
    examples: list[dict] = []
    problems: list[str] = []
    for match in _FENCE.finditer(text):
        lang, opts = _fence_lang(match.group(1))
        if lang not in {'python', 'py'} or 'notest' in opts:
            continue
        lines = [ln for ln in match.group(2).splitlines() if ln.strip()]
        includes = [m.group(1) for ln in lines if (m := _INCLUDE.match(ln))]
        line_no = text.count('\n', 0, match.start()) + 1
        if not includes or len(includes) != len(lines):
            problems.append(
                f'{page_id}:{line_no}: inline Python; move it to examples/docs/ and '
                'include it with --8<-- (or mark the fence {.python notest})'
            )
            continue
        title = next(
            (h for pos, h in reversed(headings) if pos < match.start()), page_id
        )
        examples += [{'title': title, 'page': page_id, 'file': f} for f in includes]
    return examples, problems


def doc_examples(repo_root: Path) -> tuple[list[dict], list[str]]:
    """Examples of all ``snippets: test`` pages, in manifest and page order."""
    import yaml  # noqa: PLC0415 — only needed at build/test time

    manifest = yaml.safe_load((repo_root / 'docs-sync.yaml').read_text())
    examples: list[dict] = []
    problems: list[str] = []
    for page in manifest['pages']:
        if page.get('snippets') == 'test':
            found, issues = page_examples(
                repo_root / 'docs' / page['path'], page['path']
            )
            examples += found
            problems += issues
    for ex in examples:
        if not (repo_root / ex['file']).is_file():
            problems.append(f'{ex["page"]}: included file {ex["file"]} does not exist')
    return examples, problems


def collect_examples(repo_root: Path) -> list[dict]:
    """Playground examples: ``{title, page, file, code}`` for each tested example."""
    examples, problems = doc_examples(repo_root)
    if problems:
        raise SystemExit('\n'.join(problems))
    return [{**ex, 'code': (repo_root / ex['file']).read_text()} for ex in examples]


def render_examples(examples: list[dict]) -> str:
    return json.dumps(examples, indent=2, ensure_ascii=False) + '\n'


def render_api(repo_root: Path) -> str:
    from nomad_sdk.playground.reference import build_reference  # noqa: PLC0415

    return json.dumps(build_reference(repo_root / 'src'), indent=1) + '\n'


def generated_files(repo_root: Path) -> dict[Path, str]:
    """The committed copies in playground/public/ and their expected content."""
    return {
        repo_root / EXAMPLES_PATH: render_examples(collect_examples(repo_root)),
        repo_root / API_PATH: render_api(repo_root),
    }


def build_site(out: Path, repo_root: Path, static_dir: Path = STATIC_DIR) -> None:
    if not (static_dir / 'index.html').is_file():
        raise SystemExit(
            f'{static_dir} has no index.html; build the UI first (npm run build)'
        )
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(static_dir, out)
    # examples.json / api.json come with the UI build (Vite copies playground/public/);
    # CI keeps those copies current (`--check`), so nothing is regenerated here.
    for name in ('examples.json', 'api.json'):
        if not (out / name).is_file():
            raise SystemExit(f'{static_dir} has no {name}; rebuild the UI')
    (out / 'sdk.zip').write_bytes(build_sdk_zip())
    shutil.copy2(out / 'index.html', out / '404.html')  # SPA fallback for deep links
    (out / '.nojekyll').touch()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Build playground artefacts.')
    parser.add_argument('--repo-root', type=Path, default=Path.cwd())
    group = parser.add_mutually_exclusive_group(required=True)
    parser.add_argument(
        '--static', type=Path, default=STATIC_DIR, help='UI build to package with --out'
    )
    group.add_argument('--out', type=Path, help='write a deployable static site')
    group.add_argument(
        '--update',
        '--update-examples',
        dest='update',
        action='store_true',
        help='refresh playground/public/examples.json and api.json',
    )
    group.add_argument(
        '--check',
        '--check-examples',
        dest='check',
        action='store_true',
        help='fail if playground/public/examples.json or api.json is stale',
    )
    args = parser.parse_args(argv)
    if args.out:
        build_site(args.out, args.repo_root, args.static)
        print(f'playground site written to {args.out}')
        return 0
    stale = []
    for path, content in generated_files(args.repo_root).items():
        if args.update:
            path.write_text(content)
            print(f'updated {path}')
        elif not path.is_file() or path.read_text() != content:
            stale.append(path.name)
    if stale:
        print(
            f'{", ".join(stale)} stale; run '
            '`python -m nomad_sdk.playground.bundle --update`',
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
