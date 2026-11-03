# How to use the NOMAD Python SDK

In this guide, you will install `nomad-sdk`, connect to a NOMAD deployment with a
personal access token (PAT), check which account you are authenticated as, and
generate a custom workflow archive.

`nomad-sdk` is a Python client library for NOMAD, in the style of `boto3` or the
Azure SDKs. It wraps the [NOMAD REST API](./api.md): you work with a client,
credential objects and typed results, and never build URLs or HTTP requests yourself.

| Module | What it contains |
| --- | --- |
| `nomad_sdk.identity` | Credentials, such as `PersonalAccessTokenCredential` and `EnvironmentCredential` |
| `nomad_sdk` / `nomad_sdk.api` | `NomadClient`, with operations grouped by resource (`client.users`, …) |
| `nomad_sdk.exceptions` | Errors, such as `AuthenticationError` (401) and `AuthorizationError` (403) |
| `nomad_sdk.workflow` | Builders for custom-workflow archives (`workflow.archive.yaml`) |

!!! note
    Every Python example on this page is a file in the `nomad-sdk` repository
    (`examples/docs/sdk/`). The same file is shown here and run in the `nomad-sdk`
    CI: against a mock API on each change, and nightly against the NOMAD test
    deployment.

## Before you begin

Create a PAT as described in
[How to authenticate programmatically](./auth.md). Then store it and the API base
URL of the deployment that issued it in environment variables:

```bash
read -r -s NOMAD_PAT
export NOMAD_PAT
export NOMAD_API_URL="https://nomad-lab.eu/test/backend/api/v1"
```

Install the package:

```bash
pip install nomad-sdk
```

## Connect and check your identity

`NomadClient.from_env()` reads `NOMAD_API_URL`, and uses an `EnvironmentCredential`
that takes the token from `NOMAD_PAT`. The variables are read when you call it, not
when `nomad_sdk` is imported, so you can change them without restarting your Python
session:

```python
--8<-- "examples/docs/sdk/connect_from_env.py"
```

To choose the credential yourself, pass it to the client. Any object with a
`get_token()` method works, so you can plug in your own token source:

```python
--8<-- "examples/docs/sdk/connect_with_credential.py"
```

The aliases `central`, `test`, and `develop` expand to the corresponding API base
URL. Without a credential, the client can only reach public data:

```python
--8<-- "examples/docs/sdk/deployment_alias.py"
```

## Handle authentication errors

A rejected token raises `AuthenticationError` (HTTP 401). Missing scopes or access
raise `AuthorizationError` (HTTP 403). Both carry the status code and the `detail`
returned by NOMAD:

```python
--8<-- "examples/docs/sdk/handle_errors.py"
```

## Generate a custom workflow archive

`nomad_sdk.workflow` builds the `workflow.archive.yaml` file that links existing
entries into a custom workflow. Describe each node, then let `NomadWorkflow` add
the default inputs and outputs and write the file:

```python
--8<-- "examples/docs/sdk/workflow_archive.py"
```

Upload `workflow.archive.yaml` together with the referenced mainfiles. For the
structure of the resulting graph, see
[How to create custom workflows](../gui/workflows.md).
