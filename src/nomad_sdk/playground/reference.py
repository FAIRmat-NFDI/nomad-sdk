"""API reference data for the playground's /api page (``api.json``).

Generated from the source with `griffe` (the parser behind mkdocstrings), so the
reference is the docstrings and signatures themselves; nothing is written by hand.
Covers the public API: each package's ``__all__`` (or its public classes and
functions when it has none). Docstrings use the Google style (``Args:``,
``Returns:``, ``Raises:``).

``griffe`` is a build-time dependency only (``pip install -e ".[dev]"``); the wheel
and the playground just read the generated JSON.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

#: Packages shown in the reference, in this order.
PACKAGES = [
    'nomad_sdk.identity',
    'nomad_sdk.api',
    'nomad_sdk.exceptions',
    'nomad_sdk.workflow',
]

_SKIP_PARAMS = {'self', 'cls'}


def _str(value: object) -> str | None:
    return None if value is None else str(value)


def _signature(name: str, parameters) -> str:
    """``name(a: int, /, b: str = 'x', *, c: bool = False, **kw)``."""
    parts: list[str] = []
    seen_kw_only = False
    params = [p for p in parameters if p.name not in _SKIP_PARAMS]
    for i, p in enumerate(params):
        kind = p.kind.value if p.kind else 'positional or keyword'
        if kind == 'keyword-only' and not seen_kw_only:
            parts.append('*')
            seen_kw_only = True
        prefix = {'variadic positional': '*', 'variadic keyword': '**'}.get(kind, '')
        if kind == 'variadic positional':
            seen_kw_only = True
        text = f'{prefix}{p.name}'
        if p.annotation is not None:
            text += f': {p.annotation}'
        if p.default is not None and not prefix:
            text += f' = {p.default}' if p.annotation is not None else f'={p.default}'
        parts.append(text)
        nxt = params[i + 1] if i + 1 < len(params) else None
        if kind == 'positional-only' and (
            not nxt or nxt.kind.value != 'positional-only'
        ):
            parts.append('/')
    return f'{name}({", ".join(parts)})'


def _docstring(obj) -> dict[str, Any]:
    """Description text plus the structured sections we render."""
    out: dict[str, Any] = {'text': '', 'params': {}, 'returns': [], 'raises': []}
    if not obj.docstring:
        return out
    texts: list[str] = []
    for section in obj.docstring.parse('google'):
        kind = section.kind.value
        if kind == 'text':
            texts.append(section.value)
        elif kind == 'parameters':
            for p in section.value:
                out['params'][p.name] = p.description
        elif kind == 'returns':
            out['returns'] += [
                {'type': _str(r.annotation), 'description': r.description}
                for r in section.value
            ]
        elif kind == 'raises':
            out['raises'] += [
                {'type': _str(r.annotation), 'description': r.description}
                for r in section.value
            ]
        elif kind in {'examples'}:
            for item_kind, value in section.value:
                fence = '```python\n{}\n```' if item_kind.value == 'examples' else '{}'
                texts.append(fence.format(value))
        elif kind == 'admonition':
            texts.append(f'{section.title}: {section.value.description}')
    out['text'] = '\n\n'.join(t for t in texts if t)
    return out


def _parameters(parameters, described: dict[str, str]) -> list[dict[str, Any]]:
    return [
        {
            'name': p.name,
            'type': _str(p.annotation),
            'default': _str(p.default),
            'kind': p.kind.value if p.kind else None,
            'description': described.get(p.name, ''),
        }
        for p in parameters
        if p.name not in _SKIP_PARAMS
    ]


def _function(fn, public_path: str) -> dict[str, Any]:
    doc = _docstring(fn)
    labels = sorted(str(lb) for lb in fn.labels)
    return {
        'kind': 'property' if 'property' in labels else 'function',
        'name': fn.name,
        'path': public_path,
        'signature': _signature(fn.name, fn.parameters),
        'returns_type': _str(fn.returns),
        'labels': labels,
        'description': doc['text'],
        'parameters': _parameters(fn.parameters, doc['params']),
        'returns': doc['returns'],
        'raises': doc['raises'],
    }


def _field(value) -> tuple[str | None, str]:
    """Default and description of a pydantic ``Field(default, description=...)``."""
    function = getattr(value, 'function', None)
    if function is None or str(function).rsplit('.', 1)[-1] != 'Field':
        return _str(value), ''
    default, description = None, ''
    for arg in value.arguments:
        name = getattr(arg, 'name', None)
        if name is None and default is None:
            default = str(arg)
        elif name == 'default':
            default = str(arg.value)
        elif name == 'description':
            description = str(arg.value).strip('\'"')
    return default, description


def _attribute(attr, public_path: str) -> dict[str, Any]:
    default, field_description = _field(attr.value)
    return {
        'kind': 'attribute',
        'name': attr.name,
        'path': public_path,
        'type': _str(attr.annotation),
        'default': default,
        'description': _docstring(attr)['text'] or field_description,
    }


def _is_exception(cls) -> bool:
    names = {str(b).rsplit('.', 1)[-1] for b in cls.bases}
    return bool(names & {'Exception', 'BaseException'}) or any(
        n.endswith(('Error', 'Exception')) for n in names
    )


def _is_record(cls) -> bool:
    """NamedTuple or pydantic model (directly or via a base defined in nomad_sdk)."""
    names = {str(b).rsplit('.', 1)[-1] for b in cls.bases}
    if names & {'NamedTuple', 'BaseModel'}:
        return True
    try:
        return any(_is_record(b) for b in cls.resolved_bases)
    except Exception:  # noqa: BLE001 — unresolved external base
        return False


def _class(cls, public_path: str) -> dict[str, Any]:
    doc = _docstring(cls)
    init = cls.members.get('__init__')
    init = init.final_target if init is not None and init.is_alias else init
    init_doc = _docstring(init) if init is not None and init.is_function else None
    params = []
    if init is not None and init.is_function:
        params = _parameters(
            init.parameters,
            {**doc['params'], **(init_doc['params'] if init_doc else {})},
        )
    members = []
    for name, member in cls.members.items():
        if name.startswith('_') or member.is_alias:
            continue
        if member.is_function:
            members.append(_function(member, f'{public_path}.{name}'))
        elif member.is_attribute:
            members.append(_attribute(member, f'{public_path}.{name}'))
    bases = [str(b) for b in cls.bases]
    if (
        params
        and all(p['kind'] == 'variadic keyword' for p in params)
        and _is_record(cls)
    ):
        params = []  # pydantic `__init__(**data)`: document the fields instead
    if params:
        signature = _signature(cls.name, init.parameters)
    elif _is_record(cls):  # NamedTuple / pydantic model: constructed from its fields
        fields = [m for m in members if m['kind'] == 'attribute']
        params = [
            {
                'name': m['name'],
                'type': m['type'],
                'default': m['default'],
                'kind': 'keyword-only' if 'NamedTuple' not in bases else None,
                'description': m['description'],
            }
            for m in fields
        ]
        signature = (
            f'{cls.name}('
            + ('*, ' if 'NamedTuple' not in bases and fields else '')
            + ', '.join(
                f'{p["name"]}: {p["type"]}'
                + (f' = {p["default"]}' if p['default'] else '')
                for p in params
            )
            + ')'
        )
        members = [m for m in members if m['kind'] != 'attribute']
    else:
        signature = (
            f'class {cls.name}({", ".join(bases)})' if bases else f'{cls.name}()'
        )
    return {
        'kind': 'exception' if _is_exception(cls) else 'class',
        'name': cls.name,
        'path': public_path,
        'signature': signature,
        'bases': bases,
        'description': doc['text'],
        'parameters': params,
        'raises': doc['raises'] + (init_doc['raises'] if init_doc else []),
        'members': members,
    }


def _exports(module) -> list[str]:
    if module.exports is not None:
        return [str(e) for e in module.exports]
    return [
        name
        for name, m in module.members.items()
        if not name.startswith('_') and not m.is_alias and (m.is_class or m.is_function)
    ]


def build_reference(src_dir: Path) -> dict[str, Any]:
    import griffe  # noqa: PLC0415 — build-time dependency

    root = griffe.load(
        'nomad_sdk',
        search_paths=[str(src_dir)],
        docstring_parser='google',
        resolve_aliases=True,
    )
    packages = []
    for path in PACKAGES:
        module = root[path.removeprefix('nomad_sdk.')]
        items = []
        for name in _exports(module):
            obj = module[name]
            obj = obj.final_target if obj.is_alias else obj
            public = f'{path}.{name}'
            if obj.is_class:
                items.append(_class(obj, public))
            elif obj.is_function:
                items.append(_function(obj, public))
        packages.append(
            {
                'kind': 'module',
                'name': path,
                'path': path,
                'description': _docstring(module)['text'],
                'members': items,
            }
        )
    return {'packages': packages}
