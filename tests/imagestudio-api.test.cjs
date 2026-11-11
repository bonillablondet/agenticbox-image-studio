const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
let api, server, root, requests = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaDjwHwAFBAKAPJ4DgAAAAABJRU5ErkJggg==','base64');
const init = (async () => {
  const bundle = await esbuild.build({ entryPoints:[path.join(__dirname,'../src/lib/imagestudio-api.ts')], bundle:true, platform:'node', format:'cjs', write:false });
  const Module = module.constructor, compiled = new Module('mock-api',module); compiled.paths = module.paths; compiled._compile(bundle.outputFiles[0].text,'mock-api.cjs'); api=compiled.exports;
  server=http.createServer((req,res)=>{ let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{const body=raw?JSON.parse(raw):null; requests.push({method:req.method,path:req.url,body}); res.setHeader('Content-Type','application/json');
    if(req.url==='/api/image-studio/v1/status')return res.end(JSON.stringify({available:true,mock:true}));
    if(req.url==='/api/image-studio/v1/jobs' && req.method==='POST'){res.statusCode=202;return res.end(JSON.stringify({id:'mock-1',state:'queued'}));}
    if(req.url==='/api/image-studio/v1/jobs/mock-1/cancel')return res.end(JSON.stringify({id:'mock-1',state:'cancelled'}));
    if(req.url==='/api/image-studio/v1/jobs/mock-1/result'){res.setHeader('Content-Type','image/png');return res.end(PNG);}
    if(req.url==='/api/image-studio/v1/jobs/pending')return res.end(JSON.stringify({id:'pending',state:'running'}));
    if(req.url==='/api/image-studio/v1/jobs/mock-1')return res.end(JSON.stringify({id:'mock-1',state:'completed'}));
    if(req.url==='/api/image-studio/v1/jobs/failure')return res.end(JSON.stringify({id:'failure',state:'failed',message:'synthetic failure'}));
    if(req.url==='/api/image-studio/v1/enhance')return res.end(JSON.stringify({prompt:'synthetic enhanced'}));
    res.statusCode=404;res.end('{}'); }); });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));root=`http://127.0.0.1:${server.address().port}`;
  const native=global.fetch; global.fetch=(url, options)=>{ assert.match(url,/^\/api\/image-studio\/v1\//); assert.equal(options.credentials,'same-origin'); assert.ok(!options.headers?.Authorization); return native(root+url,options); };
})();
after(()=>server?.close());
test('available status and synthetic marker',async()=>{await init;assert.deepEqual(await api.getStatus(),{available:true,mock:true});});
test('valid create, queued then completed and result',async()=>{await init;assert.equal((await api.submit({role:'create',prompt:' example '})).state,'queued');assert.equal((await api.getJob('pending')).state,'running');assert.equal((await api.getJob('mock-1')).state,'completed');const blob=await api.getResult('mock-1');assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),PNG);assert.equal(PNG.readUInt32BE(16),1);assert.equal(PNG.readUInt32BE(20),1);});
test('single reference edit',async()=>{await init;const ref='data:image/png;base64,YWJj';await api.submit({role:'edit',prompt:'edit',references:[ref]});assert.deepEqual(requests.at(-1).body,{role:'edit',prompt:'edit',references:[ref]});});
test('missing and multiple references rejected',async()=>{await init;assert.throws(()=>api.imageRequest({role:'edit',prompt:'x',references:[]}));assert.throws(()=>api.imageRequest({role:'edit',prompt:'x',references:['a','b']}));});
test('unknown role and native parameters rejected',async()=>{await init;assert.throws(()=>api.imageRequest({role:'model-path',prompt:'x'}));for(const field of ['model','sampler','steps','seed','lora','path'])assert.throws(()=>api.imageRequest({role:'create',prompt:'x',[field]:'x'}));});
test('oversized and invalid requests rejected',async()=>{await init;assert.throws(()=>api.imageRequest({role:'create',prompt:'x'.repeat(4001)}));assert.throws(()=>api.imageRequest({role:'edit',prompt:'x',references:['data:image/png;base64,'+'A'.repeat(6990512)]}));assert.throws(()=>api.imageRequest({role:'edit',prompt:'x',references:['https://example.com/x']}));});
test('cancellation and failure states',async()=>{await init;assert.equal((await api.cancel('mock-1')).state,'cancelled');assert.equal((await api.getJob('failure')).state,'failed');});
test('enhancement placeholder uses restricted path',async()=>{await init;assert.equal((await api.enhance('x','edit')).prompt,'synthetic enhanced');assert.deepEqual(requests.at(-1).body,{prompt:'x',role:'edit'});});
test('path traversal rejected before request',async()=>{await init;await assert.rejects(api.getJob('../bad'));});
test('unavailable status and malformed responses fail closed',async()=>{await init;const prior=global.fetch;global.fetch=async()=>new Response(JSON.stringify({available:false,mock:true}));assert.equal((await api.getStatus()).available,false);global.fetch=async()=>new Response('{}');await assert.rejects(api.getStatus());global.fetch=async()=>new Response('',{status:503});await assert.rejects(api.getStatus(),/503/);global.fetch=prior;});
test('mock requests are scoped application paths only',async()=>{await init;assert.ok(requests.every(r=>r.path.startsWith('/api/image-studio/v1/')));assert.ok(requests.every(r=>!r.path.includes('/sdcpp/') && !r.path.includes('/models/')));});

test('result rejects oversized header before reading body',async()=>{await init;const prior=global.fetch;let read=false,cancelled=false;global.fetch=async()=>({ok:true,headers:new Headers({'Content-Type':'image/png','Content-Length':String(5*1024*1024+1)}),body:{cancel:async()=>{cancelled=true},getReader(){read=true;throw Error('unexpected read')}}});await assert.rejects(api.getResult('mock-1'),/exceeds/);assert.equal(read,false);assert.equal(cancelled,true);global.fetch=prior;});
test('result rejects an oversized chunked stream',async()=>{await init;const prior=global.fetch;global.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(5*1024*1024+1));c.close()}}),{headers:{'Content-Type':'image/png'}});await assert.rejects(api.getResult('mock-1'),/exceeds/);global.fetch=prior;});

test('synthetic PNG contains a decodable 1x1 pixel',()=>{const z=require('node:zlib');assert.equal(PNG.subarray(0,8).toString('hex'),'89504e470d0a1a0a');let i=8,data=[];while(i<PNG.length){const n=PNG.readUInt32BE(i),name=PNG.subarray(i+4,i+8).toString();if(name==='IDAT')data.push(PNG.subarray(i+8,i+8+n));i+=12+n}assert.deepEqual(z.inflateSync(Buffer.concat(data)),Buffer.from([0,64,128,192,255]));});
