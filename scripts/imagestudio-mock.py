#!/usr/bin/env python3
"""Disposable loopback-only synthetic ImageStudio mock; no inference or persistence."""
import json, sys, uuid, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
PNG = (Path(__file__).resolve().parents[1] / 'tests' / 'fixtures' / 'synthetic-landscape.png').read_bytes()
HTML = Path(__file__).resolve().parents[1] / 'dist' / 'index.html'
jobs = {}
class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body, mime='application/json'):
        self.send_response(code); self.send_header('Content-Type', mime); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
    def send_json(self, code, obj): self.reply(code, json.dumps(obj).encode())
    def do_GET(self):
        if self.path in ('/', '/index.html'): return self.reply(200, HTML.read_bytes(), 'text/html; charset=utf-8')
        if self.path == '/api/image-studio/v1/status': return self.send_json(200, {'available':True,'mock':True,'message':'Synthetic mock available — no inference'})
        parts=self.path.split('/')
        if len(parts)>=6 and parts[:5]==['','api','image-studio','v1','jobs']:
            job=jobs.get(parts[5])
            if not job: return self.send_json(404,{'error':'unknown job'})
            if len(parts)==7 and parts[6]=='result':
                return self.reply(200,PNG,'image/png') if job['state']=='completed' else self.send_json(409,{'error':'result not ready'})
            if len(parts)==6 and job['state'] in ('queued','running'):
                job['_polls'] += 1
                if job['_polls'] >= job['_finish_after']:
                    job['state'] = 'failed' if job['_fail'] else 'completed'
                    job['message'] = 'Synthetic failure' if job['_fail'] else 'Synthetic mock image'
                else:
                    job['state'] = 'running'
            return self.send_json(200,{k:v for k,v in job.items() if not k.startswith('_')})
        self.send_json(404,{'error':'not found'})
    def do_POST(self):
        length=int(self.headers.get('Content-Length','0'))
        if length>7*1024*1024:return self.send_json(413,{'error':'too large'})
        try: body=json.loads(self.rfile.read(length) or b'{}')
        except (ValueError,UnicodeDecodeError):return self.send_json(400,{'error':'bad JSON'})
        if self.path=='/api/image-studio/v1/enhance':
            if set(body)!={'prompt','role'} or body.get('role') not in ('create','edit') or not isinstance(body.get('prompt'),str) or not body['prompt'].strip(): return self.send_json(400,{'error':'invalid enhancement'})
            if '[enhance:unavailable]' in body['prompt']: return self.send_json(503,{'error':'synthetic enhancement unavailable'})
            if '[enhance:slow]' in body['prompt']: time.sleep(3)
            prefix='Preserve the reference identity; ' if body['role']=='edit' else 'Create an original image; '
            try: return self.send_json(200,{'prompt':prefix+body['prompt']+' — synthetic suggestion'})
            except (BrokenPipeError, ConnectionResetError): return
        if self.path=='/api/image-studio/v1/jobs':
            role=body.get('role'); allowed={'role','prompt'} if role=='create' else {'role','prompt','references'}
            if role not in ('create','edit') or set(body)!=allowed or not isinstance(body.get('prompt'),str) or not body['prompt'].strip() or (role=='edit' and (not isinstance(body.get('references'),list) or len(body['references'])!=1)):return self.send_json(400,{'error':'invalid synthetic request'})
            if len(jobs)>=32: return self.send_json(429,{'error':'synthetic mock capacity reached; restart mock'})
            job={'id':uuid.uuid4().hex,'state':'queued','message':'Synthetic mock job','_polls':0,'_finish_after':10 if '[mock:slow]' in body['prompt'] else 2,'_fail':'[mock:fail]' in body['prompt']}; jobs[job['id']]=job; return self.send_json(202,{k:v for k,v in job.items() if not k.startswith('_')})
        parts=self.path.split('/')
        if len(parts)==7 and parts[:5]==['','api','image-studio','v1','jobs'] and parts[6]=='cancel' and parts[5] in jobs:
            jobs[parts[5]]['state']='cancelled'; return self.send_json(200,{k:v for k,v in jobs[parts[5]].items() if not k.startswith('_')})
        self.send_json(404,{'error':'not found'})
if __name__=='__main__':
    port=int(sys.argv[1]) if len(sys.argv)>1 else 18765
    if not HTML.is_file():raise SystemExit('Build dist/index.html first')
    print(f'Synthetic mock only: http://127.0.0.1:{port}/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
