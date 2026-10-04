"""Configure local development from an authenticated Supabase CLI without logging keys."""
import argparse
import json
import os
import pathlib
import secrets
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project-ref', required=True)
parser.add_argument('--cli', default='supabase', help='Supabase executable (default: PATH)')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
result = subprocess.run(
    [args.cli, 'projects', 'api-keys', '--project-ref', args.project_ref,
     '--reveal', '--output-format', 'json'],
    capture_output=True, text=True, timeout=60,
)
if result.returncode:
    raise SystemExit('Supabase key retrieval failed. Authenticate the CLI first; no keys were printed.')
keys = {row['name']: row['api_key'] for row in json.loads(result.stdout)
        if row.get('name') in ('anon', 'service_role') and row.get('api_key')}
if not all(key in keys for key in ('anon', 'service_role')):
    raise SystemExit('Required API keys were not returned. Configure the .env.example files manually.')
api_path = root / 'apps/api/.env'
web_path = root / 'apps/web/.env.local'

def read_settings(path):
    if not path.exists():
        return {}
    return dict(line.split('=', 1) for line in path.read_text().splitlines()
                if '=' in line and not line.lstrip().startswith('#'))

api = read_settings(api_path)
web = read_settings(web_path)
session_secret = api.get('DEMO_SESSION_SECRET') or web.get('DEMO_SESSION_SECRET') or secrets.token_hex(32)
url = f'https://{args.project_ref}.supabase.co'
api = {'PORT': '3001', 'HOST': '127.0.0.1', 'ENABLE_DEMO': 'true',
       'WEB_ORIGIN': 'http://localhost:3000', **api,
       'SUPABASE_URL': url, 'SUPABASE_SERVICE_ROLE_KEY': keys['service_role'],
       'DEMO_SESSION_SECRET': session_secret}
web = {'CHATBUD_API_URL': 'http://127.0.0.1:3001', **web,
       'NEXT_PUBLIC_SUPABASE_URL': url, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': keys['anon'],
       'DEMO_SESSION_SECRET': session_secret}
for path, values in ((api_path, api), (web_path, web)):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as file:
        file.write(''.join(f'{key}={value}\n' for key, value in values.items()))
print('Configured ignored local environment files. Existing settings and session secret were preserved.')
