from nomad_sdk import NomadClient

client = NomadClient.from_env()  # NOMAD_API_URL + EnvironmentCredential (NOMAD_PAT)
me = client.users.get_me()
print(f'Authenticated as {me.name} ({me.username})')
