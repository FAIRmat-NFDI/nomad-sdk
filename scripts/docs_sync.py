#!/usr/bin/env python3
"""Keep the nomad-docs subset in ``docs/`` consistent with nomad-docs.

Driven entirely by ``docs-sync.yaml``. Subcommands:

  import   Copy listed pages (+ their assets) from a nomad-docs checkout into
           ``docs/``. Mirror pages are always refreshed; owned pages only when
           missing or with --force. Records hashes in ``docs-sync.lock``.
  check    Fail if a mirror page is stale, or if an owned page was edited in
           nomad-docs since the last import (someone bypassed this repo).
  export   Copy owned pages (+ assets) into a nomad-docs checkout, ready to commit.
  pages    Print page paths, optionally filtered (used by CI to select tests).

This is the baseline engine for the sync workflow. Nav registration, link
rewriting and conflict resolution are deliberately out of scope for now.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'docs-sync.yaml'
LOCK = ROOT / 'docs-sync.lock'
DOCS = 'docs'

# ![alt](images/x.png#only-light)  [label](data/x.zip)  src="images/x.png"
_LINK = re.compile(r'\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)')
_SRC = re.compile(r'\bsrc="([^"]+)"')
# --8<-- "examples/docs/api/query_entries.py"  (resolved from the repo root)
_INCLUDE = re.compile(r'^\s*-{2}8<-{2}\s+"([^"]+)"', re.M)


@dataclass(frozen=True)
class Page:
    path: str
    mode: str
    snippets: str
    new: bool = False


def load_manifest() -> tuple[dict, list[Page]]:
    data = yaml.safe_load(MANIFEST.read_text())
    pages = [
        Page(p['path'], p['mode'], p.get('snippets', 'skip'), p.get('new', False))
        for p in data['pages']
    ]
    for p in pages:
        if p.mode not in {'owned', 'mirror'} or p.snippets not in {'test', 'skip'}:
            sys.exit(f'docs-sync.yaml: invalid mode/snippets for {p.path}')
    return data, pages


def assets_of(page_rel: str, text: str) -> list[str]:
    """Repo-root-relative paths of local files a page depends on."""
    page_dir = posixpath.dirname(f'{DOCS}/{page_rel}')
    found: set[str] = set()
    for raw in _LINK.findall(text) + _SRC.findall(text):
        ref = raw.split('#', 1)[0].split('?', 1)[0]
        if not ref or '://' in ref or ref.startswith(('mailto:', '/')):
            continue
        if ref.endswith('.md') or '{{' in ref:
            continue  # page links are nomad-docs' business (validated in integration)
        found.add(posixpath.normpath(posixpath.join(page_dir, ref)))
    found.update(_INCLUDE.findall(text))
    return sorted(found)


def sha(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def upstream_rev(upstream: Path) -> str:
    try:
        return subprocess.check_output(
            ['git', '-C', str(upstream), 'rev-parse', 'HEAD'], text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return 'unknown'


def files_for(page: Page, base: Path) -> list[str]:
    rel = f'{DOCS}/{page.path}'
    src = base / rel
    if not src.is_file():
        return [rel]
    return [rel, *assets_of(page.path, src.read_text())]


def copy(rel: str, src_root: Path, dst_root: Path) -> bool:
    src, dst = src_root / rel, dst_root / rel
    if not src.is_file():
        print(f'  ! missing in source: {rel}', file=sys.stderr)
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def cmd_import(args: argparse.Namespace) -> int:
    data, pages = load_manifest()
    upstream = Path(args.upstream).resolve()
    lock = {'upstream': data['upstream']['repo'], 'rev': upstream_rev(upstream)}
    lock['files'] = {}
    ok = True
    for page in pages:
        if page.new:
            continue
        here = ROOT / DOCS / page.path
        refresh = page.mode == 'mirror' or args.force or not here.exists()
        for rel in files_for(page, upstream):
            if refresh:
                ok &= copy(rel, upstream, ROOT)
            lock['files'][rel] = sha(upstream / rel)
        print(f'{"imported" if refresh else "kept    "} [{page.mode}] {page.path}')
    for item in data.get('tooling', []):
        src, dst = upstream / item['from'], ROOT / item['to']
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        lock['files'][item['from']] = sha(src)
    LOCK.write_text(json.dumps(lock, indent=2, sort_keys=True) + '\n')
    return 0 if ok else 1


def cmd_check(args: argparse.Namespace) -> int:
    data, pages = load_manifest()
    upstream = Path(args.upstream).resolve()
    locked = json.loads(LOCK.read_text())['files'] if LOCK.exists() else {}
    problems = []
    for page in pages:
        if page.new:
            if (upstream / DOCS / page.path).exists():
                problems.append(f'{page.path}: marked new but now exists upstream')
            continue
        for rel in files_for(page, upstream):
            up, here = sha(upstream / rel), sha(ROOT / rel)
            if page.mode == 'mirror' and up != here:
                problems.append(f'{rel}: mirror is stale (run `import`)')
            if page.mode == 'owned' and rel in locked and up != locked[rel]:
                problems.append(
                    f'{rel}: edited in nomad-docs since last import; '
                    'port the change here, then re-run `import --force` for this page'
                )
    for item in data.get('tooling', []):
        if sha(upstream / item['from']) != sha(ROOT / item['to']):
            problems.append(f'{item["to"]}: theme/tooling mirror is stale (run import)')
    for p in problems:
        print(f'::warning::{p}' if args.github else f'DRIFT {p}')
    return 1 if problems else 0


def cmd_export(args: argparse.Namespace) -> int:
    _, pages = load_manifest()
    target = Path(args.target).resolve()
    ok = True
    for page in pages:
        if page.mode != 'owned':
            continue
        for rel in files_for(page, ROOT):
            ok &= copy(rel, ROOT, target)
        print(f'exported {page.path}{" (NEW: add to nav)" if page.new else ""}')
    return 0 if ok else 1


def cmd_pages(args: argparse.Namespace) -> int:
    _, pages = load_manifest()
    for p in pages:
        if (args.mode in (None, p.mode)) and (args.snippets in (None, p.snippets)):
            print(f'{DOCS}/{p.path}')
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('import')
    p.add_argument('--upstream', required=True, help='nomad-docs checkout')
    p.add_argument('--force', action='store_true', help='overwrite owned pages')
    p.set_defaults(func=cmd_import)
    p = sub.add_parser('check')
    p.add_argument('--upstream', required=True)
    p.add_argument('--github', action='store_true', help='emit Actions annotations')
    p.set_defaults(func=cmd_check)
    p = sub.add_parser('export')
    p.add_argument('--target', required=True, help='nomad-docs checkout')
    p.set_defaults(func=cmd_export)
    p = sub.add_parser('pages')
    p.add_argument('--mode', choices=['owned', 'mirror'])
    p.add_argument('--snippets', choices=['test', 'skip'])
    p.set_defaults(func=cmd_pages)
    args = parser.parse_args()
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
