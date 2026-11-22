import pytest
import time
from starlette.testclient import TestClient
from api.main import app
from api.config import settings
from api.security import sign_session_id
from api.auth import active_sessions
from api.db import SessionLocal
from api.models import ResumeModel, UserModel

@pytest.fixture
def test_client():
    return TestClient(app)

def test_ai_rewrite_bullet_endpoint(test_client):
    user_data = {
        'id': 'usr_486f8383c717',
        'email': 'sumedchalakh528@gmail.com',
        'name': 'Sumed Chalakh',
        'created_at': '2026-11-21T00:00:00Z'
    }
    session_id = 'test-session-bullet-rewrite'
    active_sessions[session_id] = {'user': user_data, 'created_at': time.time()}
    signed = sign_session_id(session_id, settings.SECRET_KEY)
    test_client.cookies.set(settings.COOKIE_NAME, signed)

    # Fetch CSRF token
    csrf_res = test_client.get('/api/auth/csrf-token')
    assert csrf_res.status_code == 200
    token = csrf_res.json().get('csrf_token')

    # Post bullet rewrite
    res = test_client.post(
        '/api/v3/resumes/ai-rewrite-bullet',
        headers={'x-csrf-token': token},
        json={
            'bullet_text': 'Assisted with machine learning model development and data cleaning in Python.',
            'target_role': 'Data Scientist',
            'company': 'AirDawg Labs'
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert 'rewrite' in data
    assert len(data['rewrite']) > 15
    # Must NOT contain dummy phrases
    assert 'enhancing operational performance' not in data['rewrite']

def test_resume_document_update_and_preservation(test_client):
    user_data = {
        'id': 'usr_486f8383c717',
        'email': 'sumedchalakh528@gmail.com',
        'name': 'Sumed Chalakh',
        'created_at': '2026-11-21T00:00:00Z'
    }
    session_id = 'test-session-resume-edit'
    active_sessions[session_id] = {'user': user_data, 'created_at': time.time()}
    signed = sign_session_id(session_id, settings.SECRET_KEY)
    test_client.cookies.set(settings.COOKIE_NAME, signed)

    # Fetch current resume
    res = test_client.get('/api/v3/resumes/rez_aede581c/document')
    assert res.status_code == 200
    doc_data = res.json()
    curr_ver = doc_data['version']

    csrf_res = test_client.get('/api/auth/csrf-token')
    token = csrf_res.json().get('csrf_token')

    # Apply manual update
    updated_doc = doc_data['document']
    target_line = None
    for s in updated_doc.get('sections', []):
        for b in s.get('blocks', []):
            if b.get('lines'):
                target_line = b['lines'][0]
                break
        if target_line:
            break

    assert target_line is not None
    target_line['text'] = 'Senior AI Engineer leading enterprise evaluation pipelines.'

    put_res = test_client.put(
        '/api/v3/resumes/rez_aede581c/document',
        headers={'x-csrf-token': token, 'X-Resume-Version': str(curr_ver)},
        json={
            'version': curr_ver,
            'document': updated_doc
        }
    )
    assert put_res.status_code == 200
    saved = put_res.json()
    assert saved['version'] == curr_ver + 1
