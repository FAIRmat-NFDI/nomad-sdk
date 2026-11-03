import os

from nomad_sdk import NomadClient
from nomad_sdk.exceptions import AuthenticationError
from nomad_sdk.identity import PersonalAccessTokenCredential

bad = PersonalAccessTokenCredential('not-a-valid-token')
client = NomadClient(os.environ['NOMAD_API_URL'], bad)
try:
    client.users.get_me()
except AuthenticationError as error:
    print(f'Rejected with HTTP {error.status_code}: {error.detail}')
