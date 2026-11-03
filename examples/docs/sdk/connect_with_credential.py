import os

from nomad_sdk import NomadClient
from nomad_sdk.identity import PersonalAccessTokenCredential

credential = PersonalAccessTokenCredential(os.environ['NOMAD_PAT'])
with NomadClient(os.environ['NOMAD_API_URL'], credential) as client:
    print(client.api_url, '→', client.users.get_me().username)
