from nomad_sdk import NomadClient

client = NomadClient('test')  # anonymous; 'central', 'test' and 'develop' are aliases
print(client.api_url)
