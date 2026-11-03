# Disabled workflows

GitHub only runs workflows in `.github/workflows/`; files here are kept for later and
never run.

| File | What it does | To enable |
| --- | --- | --- |
| `docs-sync.yml` | Exports the owned docs pages (`docs-sync.yaml`) to `FAIRmat-NFDI/nomad-docs` as a pull request | Move it back to `.github/workflows/` and do the one-off setup at the top of the file |

Also off for now, on purpose:

* **Dependabot**: there is no `.github/dependabot.yml`, so no automatic dependency
  update PRs.
* **PyPI publishing**: the `pypi` job in `.github/workflows/release.yml` is commented
  out.

Until the sync is enabled, export by hand when needed:

```bash
python scripts/docs_sync.py export --target ../nomad-docs   # then open the PR yourself
```
