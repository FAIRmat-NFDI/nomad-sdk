import { describe, expect, it } from 'vitest';
import { formatSignature, parseDocstring, parseInline, summary } from './docstring';
import { ancestors, indexReference, referenceTree, resolveTarget } from './lookup';
import type { ApiReference } from './types';

const ref: ApiReference = {
  packages: [
    {
      kind: 'module',
      name: 'nomad_sdk.identity',
      path: 'nomad_sdk.identity',
      description: '',
      members: [
        {
          kind: 'class',
          name: 'PersonalAccessTokenCredential',
          path: 'nomad_sdk.identity.PersonalAccessTokenCredential',
          signature: 'PersonalAccessTokenCredential(token: str)',
          bases: [],
          description: '',
          parameters: [],
          raises: [],
          members: [
            {
              kind: 'function',
              name: 'get_token',
              path: 'nomad_sdk.identity.PersonalAccessTokenCredential.get_token',
              signature: 'get_token()',
              returns_type: 'AccessToken',
              labels: [],
              description: '',
              parameters: [],
              returns: [],
              raises: [],
            },
          ],
        },
      ],
    },
  ],
};

describe('lookup', () => {
  const index = indexReference(ref);
  it('indexes modules, items and members', () => {
    expect([...index.keys()]).toHaveLength(3);
    expect(ancestors('nomad_sdk.identity.PersonalAccessTokenCredential.get_token', index)).toEqual([
      'nomad_sdk.identity',
      'nomad_sdk.identity.PersonalAccessTokenCredential',
    ]);
  });
  it('resolves cross-references, including re-exports', () => {
    expect(resolveTarget(index, '~nomad_sdk.identity.PersonalAccessTokenCredential')).toBe(
      'nomad_sdk.identity.PersonalAccessTokenCredential',
    );
    expect(resolveTarget(index, 'nomad_sdk.identity._credentials.PersonalAccessTokenCredential')).toBe(
      'nomad_sdk.identity.PersonalAccessTokenCredential',
    );
    expect(resolveTarget(index, 'requests.Session')).toBeNull();
  });
  it('filters the tree but keeps the path to matches', () => {
    const tree = referenceTree(ref, 'get_tok');
    expect(tree[0]!.children![0]!.children!.map((n) => n.label)).toEqual(['get_token']);
    expect(referenceTree(ref, 'nothing')).toEqual([]);
  });
});

describe('docstring', () => {
  it('parses inline code and roles', () => {
    expect(parseInline('Use ``x`` or :class:`~a.b.C` and `y`.')).toEqual([
      { text: 'Use ' },
      { code: 'x' },
      { text: ' or ' },
      { ref: '~a.b.C', label: 'C' },
      { text: ' and ' },
      { code: 'y' },
      { text: '.' },
    ]);
  });
  it('parses paragraphs, lists and literal blocks', () => {
    const blocks = parseDocstring(
      'Intro\nline two::\n\n    code()\n    more()\n\n* one\n  cont\n* two\n\nEnd.',
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'code', 'list', 'paragraph']);
    expect(blocks[1]).toEqual({ type: 'code', code: 'code()\nmore()' });
    expect(blocks[2]).toMatchObject({ items: [[{ text: 'one cont' }], [{ text: 'two' }]] });
  });
  it('summarises to the first sentence', () => {
    expect(summary('A NOMAD PAT, or any :class:`~x.Token`. More.\n\nNext')).toBe(
      'A NOMAD PAT, or any Token.',
    );
  });
});

it('wraps long signatures one parameter per line', () => {
  expect(formatSignature('f(a: int)')).toBe('f(a: int)');
  expect(formatSignature('class C(a: dict[str, int], *, b: str | None = None)', 20)).toBe(
    'class C(\n    a: dict[str, int],\n    *,\n    b: str | None = None,\n)',
  );
});
