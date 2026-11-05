"""SafeFoto Stage28 standard Immich mobile-API compatibility smoke (TEST LAB ONLY).
Uses real password session and standard REST/mobile sync APIs, no custom SafeFoto family
endpoints for the core compatibility checks. Does not store or display credentials.
Only creates and deletes one synthetic 8x8 PNG in the test user's private library.
Requires SAFEFOTO_TEST_LOGIN_FILE; usage documented in README.md.
"""
import json
import os
import struct
import uuid
import zlib
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = os.environ.get('SAFEFOTO_TEST_URL', 'http://192.168.0.188:13013').rstrip('/')
CREDENTIALS = os.environ['SAFEFOTO_TEST_LOGIN_FILE']
creds = dict(line.split('=', 1) for line in Path(CREDENTIALS).read_text().splitlines() if '=' in line)
assert creds.get('EMAIL') and creds.get('PASSWORD')
assert BASE.startswith('http://192.168.') or BASE.startswith('http://127.0.0.1:'), 'TEST LAN only'
TOKEN = None
created_asset = None

def call(method, endpoint, body=None, content_type='application/json'):
    headers = {'Accept': 'application/json'}
    if TOKEN:
        headers['Authorization'] = 'Bearer ' + TOKEN
    data = None
    if body is not None:
        data = json.dumps(body).encode() if content_type == 'application/json' else body
        headers['Content-Type'] = content_type
    req = Request(BASE+'/api'+endpoint, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=25) as response:
            return response.status, response.headers.get('Content-Type', ''), response.read()
    except HTTPError as error:
        return error.code, error.headers.get('Content-Type', ''), error.read(2000)

def expect(method, endpoint, required, body=None, content_type='application/json'):
    status, kind, payload = call(method, endpoint, body, content_type)
    assert status in required, f'{method} {endpoint}: HTTP {status}'
    print('PASS', method, endpoint.split('?')[0], 'HTTP', status, flush=True)
    return status, kind, payload

def decode(payload):
    return json.loads(payload.decode())

def png_fixture():
    seed = uuid.uuid4().bytes
    raw = b''.join(b'\x00' + b''.join(bytes((seed[(x+y) % 16],seed[(x+y+4) % 16],seed[(x+y+8) % 16])) for x in range(8)) for y in range(8))
    def chunk(kind, content):
        return struct.pack('>I',len(content))+kind+content+struct.pack('>I',zlib.crc32(kind+content)&0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR',struct.pack('>IIBBBBB',8,8,8,2,0,0,0)) +
            chunk(b'IDAT',zlib.compress(raw)) +
            chunk(b'IEND',b''))

def multipart(fields, filename, content):
    boundary='safefoto-stage28-'+uuid.uuid4().hex
    data=bytearray()
    for name,value in fields.items():
        data.extend(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+str(value)+'\r\n').encode())
    data.extend(('--'+boundary+'\r\nContent-Disposition: form-data; name="assetData"; filename="'+filename+'"\r\nContent-Type: image/png\r\n\r\n').encode())
    data.extend(content)
    data.extend(('\r\n--'+boundary+'--\r\n').encode())
    return bytes(data), 'multipart/form-data; boundary='+boundary

try:
    _,_,body=expect('GET','/server/version',{200})
    version=decode(body)
    assert all(isinstance(version.get(key),int) for key in ('major','minor','patch'))
    _,_,body=expect('POST','/auth/login',{201,200},{'email':creds['EMAIL'],'password':creds['PASSWORD']})
    session=decode(body)
    TOKEN=session.get('accessToken')
    assert isinstance(TOKEN,str) and len(TOKEN)>20
    assert isinstance(session.get('userId'),str)
    _,_,body=expect('POST','/auth/validateToken',{200},{})
    assert decode(body).get('authStatus') is True
    for endpoint in ['/server/features','/server/config','/server/storage','/users/me','/users/me/preferences','/albums','/assets/statistics','/sync/ack']:
        _,_,payload=expect('GET',endpoint,{200})
        data=decode(payload)
        assert isinstance(data,(list,dict)),endpoint
    _,kind,payload=expect('POST','/sync/stream',{200},{'types':['AuthUsersV1','UsersV1','AssetsV2','AlbumsV2']})
    assert 'jsonlines+json' in kind,kind
    events=[json.loads(line) for line in payload.splitlines() if line.strip()]
    assert events and all(isinstance(event.get('type'),str) for event in events)
    print('PASS sync stream parsed',len(events),'events (contents not logged)',flush=True)
    # Standard personal upload. Deliberately do NOT publish to family or modify existing photos.
    now=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    payload,ctype=multipart({'fileCreatedAt':now,'fileModifiedAt':now,'isFavorite':'false'},
                            'safefoto-stage28-test-'+uuid.uuid4().hex+'.png',png_fixture())
    _,_,reply=expect('POST','/assets',{201},payload,ctype)
    result=decode(reply)
    assert result.get('status', '').lower() == 'created', 'Synthetic upload was not newly created'
    created_asset=result.get('id')
    assert created_asset
    _,_,body=expect('GET','/assets/'+created_asset,{200})
    asset=decode(body)
    assert asset.get('id')==created_asset
    assert asset.get('ownerId')==session['userId']
    _,kind,payload=expect('GET','/assets/'+created_asset+'/original',{200})
    assert payload.startswith(b'\x89PNG\r\n\x1a\n'), 'Original file mismatch'
    # This verifies that standard upload did not publish to the separate family timeline.
    _,_,reply=expect('GET','/family/photos?page=1&limit=50',{200})
    family=decode(reply)
    assert created_asset not in [item['id'] for item in family.get('items',[])], 'Private upload leaked into family'
finally:
    if created_asset:
        status,_,_=call('DELETE','/assets',{'ids':[created_asset],'force':False})
        print('CLEANUP',status,'synthetic test photo only',flush=True)
        assert status==204, 'Synthetic fixture was not deleted'
    if TOKEN:
        logout_status, _, _ = call('POST', '/auth/logout', {})
        print('SESSION_LOGOUT', logout_status, flush=True)
        assert logout_status == 200, 'Test session logout failed'
    TOKEN=None
