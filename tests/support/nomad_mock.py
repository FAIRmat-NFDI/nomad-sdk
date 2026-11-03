"""Offline stand-in for the NOMAD API, shared by unit tests and doc-snippet tests.

Extend ``register_nomad_mock`` whenever a new resource lands in the SDK, so the
docs that use it can be executed offline on every pull request.
"""

import json

import responses

MOCK_API_URL = 'https://nomad.mock/test/backend/api/v1'
MOCK_PAT = 'mock-personal-access-token'
MOCK_USER = {
    'user_id': '00000000-0000-0000-0000-000000000000',
    'name': 'Ada Lovelace',
    'username': 'ada',
    'email': 'ada@example.org',
}


def register_nomad_mock(rsps: responses.RequestsMock) -> None:
    def users_me(request):
        if request.headers.get('Authorization') != f'Bearer {MOCK_PAT}':
            return 401, {}, json.dumps({'detail': 'Unauthorized'})
        return 200, {}, json.dumps(MOCK_USER)

    rsps.add_callback(
        responses.GET,
        f'{MOCK_API_URL}/users/me',
        callback=users_me,
        content_type='application/json',
    )
    rsps.post(
        f'{MOCK_API_URL}/auth/token',
        json={'access_token': MOCK_PAT, 'expires_in': 300},
    )
