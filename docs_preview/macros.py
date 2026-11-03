"""mkdocs-macros shim so the docs subset renders standalone.

nomad-docs defines `nav_link` / `nomad_url` against its full navigation and
NOMAD config. Here, links to pages inside the subset stay local; links to pages
outside it point at the published NOMAD docs (same `.html` URL style, since the
preview inherits `use_directory_urls: false`). The authoritative render is the
`docs-integration` CI job, which builds this subset inside nomad-docs.
"""

import posixpath
from pathlib import Path

PUBLISHED_DOCS = 'https://nomad-lab.eu/prod/v1/docs'
API_URL = 'https://nomad-lab.eu/prod/v1/api'


def define_env(env):
    docs_dir = Path(env.conf['docs_dir'])

    @env.macro
    def nav_link(source_path: str, breadcrumb: bool = False) -> str:
        title = source_path.rsplit('/', 1)[-1].removesuffix('.md').replace('_', ' ')
        title = title.capitalize()
        if (docs_dir / source_path).is_file():
            here = posixpath.dirname(env.page.file.src_path)
            return f'[{title}]({posixpath.relpath(source_path, here or ".")})'
        return f'[{title}]({PUBLISHED_DOCS}/{source_path.removesuffix(".md")}.html)'

    @env.macro
    def nomad_url() -> str:
        return API_URL
