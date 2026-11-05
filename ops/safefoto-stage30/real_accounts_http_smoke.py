"""Stage30: real-account family sharing E2E on isolated SafeFoto TEST LAB.
Creates 3 unique artificial accounts + 1 PNG, exercises invitations and revocation,
then deletes ONLY those fixtures; never touches existing users/photos.
"""
import json
import os
import secrets
import struct
import uuid
import zlib
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = os.environ.get('SAFEFOTO_TEST_URL', 'http://192.168.0.188:13013').rstrip('/')
assert BASE.startswith(('http://192.168.', 'http://127.0.0.1:')), 'Only trusted TEST-LAN server'
CREDENTIALS = dict(line.split('=', 1) for line in Path(os.environ['SAFEFOTO_TEST_LOGIN_FILE']).read_text().splitlines() if '=' in line)
ADMIN_TOKEN = None
FIXTURES = []
PHOTO = None
OWNER_TOKEN = None

def call(method, path, token=None, value=None, ctype='application/json'):
    headers={'Accept':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    payload=None
    if value is not None:
        payload=json.dumps(value).encode() if ctype=='application/json' else value
        headers['Content-Type']=ctype
    req=Request(BASE+'/api'+path,method=method,data=payload,headers=headers)
    try:
        with urlopen(req,timeout=25) as r: return r.status,r.headers.get('content-type',''),r.read()
    except HTTPError as e: return e.code,e.headers.get('content-type',''),e.read(2500)

def check(method, path, token=None, value=None, accepted=(200,), ctype='application/json'):
    status,kind,data=call(method,path,token,value,ctype)
    assert status in accepted,f'{method} {path.split("?")[0]} status={status} expected={accepted}: {data[:200]!r}'
    print('PASS',method,path.split('?')[0].rsplit('/',1)[0] if '/invitations/' in path and path.endswith('/accept') else path.split('?')[0],status,flush=True)
    return json.loads(data) if data else None

def login(email,password):
    return check('POST','/auth/login',value={'email':email,'password':password},accepted=(200,201))['accessToken']

def list_ids(token):
    data=check('GET','/family/photos?page=1&limit=100',token)
    return {item['id'] for item in data['items']}

def fixture_png():
    seed=secrets.token_bytes(16)
    raw=b''.join(b'\x00'+b''.join(bytes((seed[(x+y)%16],seed[(x+y+5)%16],seed[(x+y+10)%16])) for x in range(8)) for y in range(8))
    def c(kind,value): return struct.pack('>I',len(value))+kind+value+struct.pack('>I',zlib.crc32(kind+value)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',8,8,8,2,0,0,0))+c(b'IDAT',zlib.compress(raw))+c(b'IEND',b'')

def multipart(filename,blob):
    boundary='safefoto-stage30-'+uuid.uuid4().hex
    timestamp=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    data=bytearray()
    for key,val in {'fileCreatedAt':timestamp,'fileModifiedAt':timestamp,'isFavorite':'false'}.items():
        data.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{val}\r\n'.encode())
    data.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="assetData"; filename="{filename}"\r\nContent-Type: image/png\r\n\r\n'.encode())
    data.extend(blob)
    data.extend(f'\r\n--{boundary}--\r\n'.encode())
    return bytes(data),'multipart/form-data; boundary='+boundary

try:
    ADMIN_TOKEN=login(CREDENTIALS['EMAIL'],CREDENTIALS['PASSWORD'])
    for role in ['owner','member','outsider']:
        email=f'safefoto-stage30-{role}-{uuid.uuid4().hex[:12]}@example.invalid'
        password=secrets.token_urlsafe(28)
        account=check('POST','/admin/users',ADMIN_TOKEN,
                      {'email':email,'password':password,'name':'SafeFoto QA '+role,'isAdmin':False,
                       'shouldChangePassword':False,'notify':False},accepted=(201,))
        FIXTURES.append({'id':account['id'],'role':role,'email':email,'password':password})
    users={a['role']:a for a in FIXTURES}
    tokens={role:login(a['email'],a['password']) for role,a in users.items()}
    OWNER_TOKEN=tokens['owner']

    member=tokens['member'];owner=tokens['owner'];outsider=tokens['outsider']
    assert check('GET','/users/me/household',owner)['householdId'] != check('GET','/users/me/household',member)['householdId']
    invite=check('POST','/users/me/household/invitations',owner,{'email':users['member']['email']},accepted=(201,))
    assert invite['status']=='PENDING'
    pending=check('GET','/users/me/household/invitations/incoming',member)
    assert any(item['id']==invite['id'] for item in pending)
    check('POST','/users/me/household/invitations/'+invite['id']+'/accept',member,{},accepted=(200,201))

    owner_household=check('GET','/users/me/household',owner)
    member_household=check('GET','/users/me/household',member)
    assert owner_household['householdId']==member_household['householdId']
    assert check('GET','/users/me/household',outsider)['householdId']!=owner_household['householdId']

    data,ctype=multipart('safefoto-stage30-qa-'+uuid.uuid4().hex+'.png',fixture_png())
    asset=check('POST','/assets',owner,data,accepted=(201,),ctype=ctype)
    assert asset['status'].lower()=='created'
    PHOTO=asset['id']
    assert PHOTO not in list_ids(member), 'Private image exposed before sharing'
    assert PHOTO not in list_ids(outsider), 'Private image leaked outside household'

    check('PUT','/family/photos/publication',owner,{'assetIds':[PHOTO],'mode':'share'},accepted=(204,))
    assert PHOTO in list_ids(member), 'Invited member did not see shared image'
    assert PHOTO not in list_ids(outsider), 'Outsider saw shared image'
    member_media_status,member_type,_=call('GET','/assets/'+PHOTO+'/original',member)
    assert member_media_status==200 and 'image/png' in member_type
    outsider_status,_,outsider_data=call('GET','/assets/'+PHOTO+'/original',outsider)
    assert outsider_status in (400,403,404) and not outsider_data.startswith(b'\x89PNG')

    check('POST','/users/me/household/leave',member,{},accepted=(200,201))
    assert PHOTO not in list_ids(member), 'Former member retained family photo metadata'
    former_status,_,former_data=call('GET','/assets/'+PHOTO+'/original',member)
    assert former_status in (400,403,404) and not former_data.startswith(b'\x89PNG')
    assert PHOTO in list_ids(owner), 'Owner lost published image after member left'
    print('PASS full invitation -> sharing -> revocation, 3 real logins, real server',flush=True)
finally:
    if PHOTO and OWNER_TOKEN:
        status,_,_=call('PUT','/family/photos/publication',OWNER_TOKEN,{'assetIds':[PHOTO],'mode':'private'})
        print('CLEANUP photo publication',status,flush=True)
        status,_,_=call('DELETE','/assets',OWNER_TOKEN,{'ids':[PHOTO],'force':False})
        print('CLEANUP synthetic photo',status,flush=True)
    if ADMIN_TOKEN:
        for fixture in FIXTURES:
            status,_,_=call('DELETE','/admin/users/'+fixture['id'],ADMIN_TOKEN,{'force':True})
            print('CLEANUP synthetic account',fixture['role'],status,flush=True)
        call('POST','/auth/logout',ADMIN_TOKEN,{})
