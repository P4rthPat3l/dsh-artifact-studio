import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactService } from '../dist/host/lib/service.js';
import { ArtifactStore, hashOf } from '../dist/host/lib/store.js';
import { generationHash, generationSummary, generationText } from '../dist/host/lib/generation.js';

const source = { origin: 'agent', action: 'create' };
const A = { workspaceId: 'a' };
const B = { workspaceId: 'b' };
const page = '<meta name="artifact-kit" content="1"><meta name="viewport" content="width=device-width"><h1>Frozen</h1>';
async function fixture(t, limits = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-snap-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const records = [{ id: 'a', path: path.join(home,'a') }, { id: 'b', path: path.join(home,'b') }];
  const registry = { get: id => records.find(r => r.id === id), list: () => records };
  const svc = new ArtifactService({ home, workspaceBase: 'workspaces', libraryDir: 'library' }, registry, new ArtifactStore(limits));
  return { home, svc, dir: id => path.join(home, 'workspaces/a', id) };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error.code === code);
}

test('SNAP-AC-001: two named systems coexist and resolve independently', async t => {
  const {svc} = await fixture(t);
  const one = await svc.saveDesignSystem(A, {name:'One',colors:{primary:'#112233'}}, {createNew:true,expectedRevision:0});
  const two = await svc.saveDesignSystem(A, {name:'Two',colors:{primary:'#445566'}}, {createNew:true,expectedRevision:1});
  const catalog = await svc.listDesignSystems(A);
  assert.equal(catalog.systems.length,2);
  assert.notEqual(one.system.id,two.system.id);
  assert.equal((await svc.designSystem(A,{systemId:one.system.id})).tokens.colors.primary,'#112233');
  assert.equal((await svc.designSystem(A,{systemId:two.system.id})).tokens.colors.primary,'#445566');
});

test('SNAP-AC-003: changing default affects only new artifacts', async t => {
  const {svc} = await fixture(t);
  const one = await svc.saveDesignSystem(A,{name:'One',colors:{primary:'#123456'}},{createNew:true,expectedRevision:0,makeDefault:true});
  const first = await svc.create(A,{type:'page',title:'First',content:page,source});
  await svc.saveDesignSystem(A,{name:'Two',colors:{primary:'#654321'}},{createNew:true,expectedRevision:1,makeDefault:true});
  const second = await svc.create(A,{type:'page',title:'Second',content:page,source});
  assert.equal((await svc.read(A,first.id)).design.colors.primary,'#123456');
  assert.equal((await svc.read(A,second.id)).design.colors.primary,'#654321');
  assert.equal((await svc.read(A,first.id)).generation.system.id,one.system.id);
});

test('SNAP-AC-004: ordinary edits retain pinned settings and recipe definition', async t => {
  const {svc} = await fixture(t);
  await svc.saveDesignSystem(A,{colors:{primary:'#112233'}});
  const first=await svc.create(A,{type:'page',title:'First',content:page,recipe:'feature-spec',source});
  const before=await svc.read(A,first.id);
  await svc.saveDesignSystem(A,{colors:{primary:'#aabbcc'}});
  await svc.saveGuide(A,{recipe:{id:'feature-spec',name:'Replacement',types:['page'],purpose:'Changed',sections:[],rules:[]}});
  await svc.update(A,first.id,{baseVersion:1,content:page+'<p>Edit</p>',source});
  const after=await svc.read(A,first.id);
  assert.equal(after.design.colors.primary,'#112233');
  assert.equal(after.generation.hash,before.generation.hash);
  assert.equal((await svc.recipeOf(A,after.manifest)).name,'Feature specification');
});

test('SNAP-AC-005: rebase appends one version and refuses stale callers', async t => {
  const {svc} = await fixture(t);
  const created=await svc.create(A,{type:'page',title:'First',content:page,source});
  await svc.saveDesignSystem(A,{colors:{primary:'#abcdef'}},{createNew:true,expectedRevision:0,makeDefault:true});
  const rebased=await svc.rebase(A,created.id,{baseVersion:1,source});
  assert.equal(rebased.version,2);
  assert.equal((await svc.read(A,created.id)).content,page);
  assert.equal((await svc.read(A,created.id)).design.colors.primary,'#abcdef');
  await assert.rejects(svc.rebase(A,created.id,{baseVersion:1,source}),e=>e.code==='artifact/stale-version');
});

test('SNAP-AC-006: stale catalog saves cannot replace accepted revisions', async t => {
  const {svc}=await fixture(t);
  const one=await svc.saveDesignSystem(A,{name:'One'},{createNew:true,expectedRevision:0});
  const results=await Promise.allSettled([
    svc.saveDesignSystem(A,{name:'A'},{systemId:one.system.id,expectedRevision:1}),
    svc.saveDesignSystem(A,{name:'B'},{systemId:one.system.id,expectedRevision:1})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'artifact/stale-catalog');
});

test('SNAP-AC-007: export and print resolve the selected frozen version', async t => {
  const {svc}=await fixture(t);
  await svc.saveDesignSystem(A,{colors:{primary:'#112233'}});
  const created=await svc.create(A,{type:'page',title:'First',content:page,source});
  await svc.saveDesignSystem(A,{colors:{primary:'#aabbcc'}});
  await svc.rebase(A,created.id,{baseVersion:1,source});
  assert.match((await svc.printable(A,created.id,1)).html,/--artifact-color-primary: #112233/);
  const exported=await svc.export(A,created.id,'html',1);
  assert.match(Buffer.from(exported.data,'base64').toString(),/--artifact-color-primary: #112233/);
  assert.match((await svc.read(A,created.id,1)).designCss,/--artifact-color-primary: #112233/);
});

test('SNAP-AC-009: restore copies content and generation from its source version', async t => {
  const {svc}=await fixture(t);
  const created=await svc.create(A,{type:'page',title:'First',content:page,source});
  const original=await svc.read(A,created.id);
  await svc.saveDesignSystem(A,{colors:{primary:'#abcdef'}});
  await svc.rebase(A,created.id,{baseVersion:1,source});
  await svc.restore(A,created.id,1,source,2);
  const restored=await svc.read(A,created.id);
  assert.equal(restored.version,3);
  assert.equal(restored.generation.hash,original.generation.hash);
  assert.equal(restored.manifest.source.restoredFrom,1);
});

test('SNAP-AC-010: legacy reads remain live and editing pins only the new version', async t => {
  const {svc,dir}=await fixture(t);
  const root=await svc.root(A);
  const created=await svc.store.create(root,{type:'page',title:'Legacy',content:page,source});
  const meta=path.join(dir(created.id),'versions/1/meta.json');
  const old=await fs.readFile(meta,'utf8');
  assert.equal((await svc.read(A,created.id)).generation,undefined);
  await svc.saveDesignSystem(A,{colors:{primary:'#aabbcc'}});
  assert.equal((await svc.read(A,created.id)).design.colors.primary,'#aabbcc');
  assert.equal(await fs.readFile(meta,'utf8'),old);
  await svc.update(A,created.id,{baseVersion:1,content:page+'<p>Next</p>',source});
  assert.ok((await svc.read(A,created.id)).generation);
  assert.equal((await svc.read(A,created.id,1)).generation,undefined);
});

test('SNAP-AC-011: corrupt or missing pinned generation never falls back', async t => {
  const {svc,dir}=await fixture(t);
  const created=await svc.create(A,{type:'page',title:'First',content:page,source});
  const file=path.join(dir(created.id),'versions/1/generation.json');
  const original=await fs.readFile(file,'utf8');
  await fs.writeFile(file,original.replace('Default','Corrupted'));
  await assert.rejects(svc.read(A,created.id),e=>e.code==='artifact/corrupt');
  await fs.rm(file);
  await assert.rejects(svc.read(A,created.id),e=>e.code==='artifact/corrupt');
});

test('SNAP-AC-013: snapshots stay out of manifest and count toward retention', async t => {
  const {svc,dir}=await fixture(t,{maxVersionsBytes:3000});
  const created=await svc.create(A,{type:'page',title:'First',content:page,source});
  const saved = await svc.read(A,created.id);
  svc.store.limits.maxVersionsBytes = saved.manifest.contentBytes + saved.generation.bytes + 1;
  await svc.update(A,created.id,{baseVersion:1,content:page,source});
  const manifest=await fs.readFile(path.join(dir(created.id),'artifact.json'),'utf8');
  assert.doesNotMatch(manifest,/"colors"/);
  const history=await svc.history(A,created.id);
  assert.doesNotMatch(JSON.stringify(history),/"colors"/);
  assert.ok(history[0].generation.bytes>0);
  assert.equal(history.length,1);
});

test('SNAP-AC-002: a workspace choice never changes the library or another workspace', async t => {
  const {svc}=await fixture(t);
  const library=await svc.saveDesignSystem({scope:'library'},{name:'Library',colors:{primary:'#101010'}},{createNew:true,expectedRevision:0,makeDefault:true});
  const a=await svc.saveDesignSystem(A,{name:'A',colors:{primary:'#202020'}},{createNew:true,expectedRevision:0,makeDefault:true});
  const b=await svc.saveDesignSystem(B,{name:'B',colors:{primary:'#303030'}},{createNew:true,expectedRevision:0,makeDefault:true});
  assert.equal((await svc.designSystem(A)).system.id,a.system.id);
  assert.equal((await svc.designSystem(B)).system.id,b.system.id);
  assert.equal((await svc.designSystem({scope:'library'})).system.id,library.system.id);
  assert.equal((await svc.designSystem({scope:'library'})).tokens.colors.primary,'#101010');
  assert.equal((await svc.listDesignSystems(A)).defaultId,a.system.id);
  assert.equal((await svc.listDesignSystems(B)).defaultId,b.system.id);
  assert.equal((await svc.listDesignSystems({scope:'library'})).defaultId,library.system.id);
  assert.equal((await svc.listDesignSystems(A)).systems.some(s=>s.id===library.system.id),false);
  await rejectsCode(svc.designSystem(B,{systemId:a.system.id}),'artifact/not-found');
  assert.equal((await svc.designSystem(B,{systemId:library.system.id})).system.id,library.system.id);
});

test('SNAP-AC-012: a crash before the manifest commit keeps the old version authoritative', async t => {
  const {svc}=await fixture(t);
  const old=await svc.saveDesignSystem(A,{name:'Old',colors:{primary:'#112233'}},{createNew:true,expectedRevision:0,makeDefault:true});
  const created=await svc.create(A,{type:'page',title:'Crash',content:page,source});
  const saved=await svc.read(A,created.id);
  await svc.saveDesignSystem(A,{name:'New',colors:{primary:'#aabbcc'}},{createNew:true,expectedRevision:1,makeDefault:true});
  const root=await svc.root(A);
  const dir=path.join(root.root,created.id);
  const next=page+'<p>Uncommitted</p>';
  // The snapshot and the live content landed; the manifest did not.
  const orphanGeneration={schemaVersion:1,tokens:(await svc.designSystem(A)).tokens,system:null,tokenSource:'workspace',recipe:null,kit:null,conventionsHash:'sha256:'+'a'.repeat(64)};
  await fs.mkdir(path.join(dir,'versions/2/content'),{recursive:true});
  await fs.writeFile(path.join(dir,'versions/2/content/index.html'),next);
  await fs.writeFile(path.join(dir,'versions/2/generation.json'),generationText(orphanGeneration));
  await fs.writeFile(path.join(dir,'versions/2/meta.json'),JSON.stringify({version:2,createdAt:new Date().toISOString(),contentHash:hashOf(next),contentBytes:Buffer.byteLength(next),source,generation:generationSummary(orphanGeneration)}));
  await fs.writeFile(path.join(dir,'content/index.html'),next);
  // A newer snapshot with no manifest at all.
  await fs.mkdir(path.join(dir,'versions/3/content'),{recursive:true});
  await fs.writeFile(path.join(dir,'versions/3/content/index.html'),page+'<p>Orphan</p>');
  await fs.writeFile(path.join(dir,'versions/3/meta.json'),JSON.stringify({version:3,createdAt:new Date().toISOString(),contentHash:hashOf(page+'<p>Orphan</p>'),contentBytes:Buffer.byteLength(page+'<p>Orphan</p>'),source}));
  const current=await svc.read(A,created.id);
  assert.equal(current.version,1);
  assert.equal(current.content,page);
  assert.equal(current.generation.hash,saved.generation.hash);
  assert.equal(current.generation.system.id,old.system.id);
  assert.equal(current.design.colors.primary,'#112233');
  assert.equal((await svc.history(A,created.id)).length,1);
  assert.equal((await svc.store.manifest(root,created.id)).version,1);
  await rejectsCode(svc.read(A,created.id,2),'artifact/version-not-found');
  // The next clean commit replaces the crash leftover and prunes the newer orphan.
  await svc.update(A,created.id,{baseVersion:1,content:next,source});
  const committed=await svc.read(A,created.id);
  assert.equal(committed.version,2);
  assert.equal(committed.content,next);
  assert.equal((await svc.history(A,created.id)).length,2);
  await rejectsCode(fs.stat(path.join(dir,'versions/3')),'ENOENT');
});

test('SNAP-AC-015: catalog links and path-like ids are refused before any write', async t => {
  const {svc,home}=await fixture(t);
  const root=await svc.root(A);
  const outside=path.join(home,'outside-catalog');
  await fs.mkdir(outside,{recursive:true});
  await fs.symlink(outside,path.join(root.root,'design-systems'),'dir');
  await rejectsCode(svc.saveDesignSystem(A,{name:'Escaped'},{createNew:true,expectedRevision:0}),'artifact/forbidden-path');
  await rejectsCode(svc.listDesignSystems(A),'artifact/forbidden-path');
  assert.deepEqual(await fs.readdir(outside),[]);
  await fs.rm(path.join(root.root,'design-systems'));
  const decoy=path.join(root.root,'decoy-catalog');
  await fs.mkdir(decoy);
  await fs.symlink(decoy,path.join(root.root,'design-systems'),'dir');
  await rejectsCode(svc.saveDesignSystem(A,{name:'In-root'},{createNew:true,expectedRevision:0}),'artifact/forbidden-path');
  assert.deepEqual(await fs.readdir(decoy),[]);
  await fs.rm(path.join(root.root,'design-systems'));
  await fs.mkdir(path.join(root.root,'design-systems'));
  await fs.writeFile(path.join(outside,'index.json'),'{}');
  await fs.symlink(path.join(outside,'index.json'),path.join(root.root,'design-systems/index.json'));
  await rejectsCode(svc.listDesignSystems(A),'artifact/forbidden-path');
  await rejectsCode(svc.saveDesignSystem(A,{name:'Escaped'},{createNew:true,expectedRevision:0}),'artifact/forbidden-path');
  assert.equal(await fs.readFile(path.join(outside,'index.json'),'utf8'),'{}');
  await rejectsCode(svc.designSystem(A,{systemId:'../escape'}),'artifact/bad-request');
});

test('SNAP-AC-015: generation directories and files reject planted links', async t => {
  const {svc,home}=await fixture(t);
  const created=await svc.create(A,{type:'page',title:'Links',content:page,source});
  const root=await svc.root(A);
  const dir=path.join(root.root,created.id);
  const outside=path.join(home,'outside-generation');
  await fs.mkdir(outside,{recursive:true});
  await fs.symlink(outside,path.join(dir,'versions/2'),'dir');
  const next=page+'<p>Second</p>';
  await rejectsCode(svc.update(A,created.id,{baseVersion:1,content:next,source}),'artifact/forbidden-path');
  assert.deepEqual(await fs.readdir(outside),[]);
  await fs.rm(path.join(dir,'versions/2'));
  await fs.mkdir(path.join(dir,'versions/2'));
  const sentinel=path.join(root.root,'decoy-generation.json');
  await fs.writeFile(sentinel,'keep');
  await fs.symlink(sentinel,path.join(dir,'versions/2/generation.json'));
  await rejectsCode(svc.update(A,created.id,{baseVersion:1,content:next,source}),'artifact/forbidden-path');
  assert.equal(await fs.readFile(sentinel,'utf8'),'keep');
  assert.deepEqual(await fs.readdir(outside),[]);
  assert.equal((await svc.read(A,created.id)).version,1);
  assert.equal((await svc.read(A,created.id)).content,page);
});

test('SNAP-AC-016: unsupported catalog and generation schemas fail explicitly', async t => {
  const {svc}=await fixture(t);
  const root=await svc.root(A);
  await fs.mkdir(path.join(root.root,'design-systems'),{recursive:true});
  const indexFile=path.join(root.root,'design-systems/index.json');
  const unsupported=JSON.stringify({schemaVersion:2,revision:0,defaultId:null,systems:[]})+'\n';
  await fs.writeFile(indexFile,unsupported);
  await rejectsCode(svc.listDesignSystems(A),'artifact/corrupt');
  await rejectsCode(svc.saveDesignSystem(A,{name:'Nope'},{createNew:true,expectedRevision:0}),'artifact/corrupt');
  assert.equal(await fs.readFile(indexFile,'utf8'),unsupported);
  await fs.rm(indexFile);
  const created=await svc.create(A,{type:'page',title:'Schema',content:page,source});
  const saved=await svc.read(A,created.id);
  const dir=path.join(root.root,created.id);
  const generationFile=path.join(dir,'versions/1/generation.json');
  const text=(await fs.readFile(generationFile,'utf8')).replace('"schemaVersion":1','"schemaVersion":2');
  assert.match(text,/"schemaVersion":2/);
  const summary={...saved.generation,hash:generationHash(text),bytes:Buffer.byteLength(text)};
  const metaFile=path.join(dir,'versions/1/meta.json');
  const meta=JSON.parse(await fs.readFile(metaFile,'utf8'));
  await fs.writeFile(metaFile,JSON.stringify({...meta,generation:summary}));
  const manifestFile=path.join(dir,'artifact.json');
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  await fs.writeFile(manifestFile,JSON.stringify({...manifest,generation:summary}));
  await fs.writeFile(generationFile,text);
  await rejectsCode(svc.read(A,created.id),'artifact/corrupt');
  const legacy=await svc.store.create(root,{type:'page',title:'Older',content:page,source});
  const payload=await svc.read(A,legacy.id);
  assert.equal(payload.generation,undefined);
  assert.equal(payload.content,page);
});

test('SNAP-AC-007: a pinned version renders after its named catalog entry is gone', async t => {
  const {svc}=await fixture(t);
  const system=await svc.saveDesignSystem(A,{name:'Pinned',colors:{primary:'#112233'}},{createNew:true,expectedRevision:0,makeDefault:true});
  const created=await svc.create(A,{type:'page',title:'Pinned',content:page,source});
  const root=await svc.root(A);
  await fs.rm(path.join(root.root,'design-systems'),{recursive:true,force:true});
  const saved=await svc.read(A,created.id);
  assert.equal(saved.design.colors.primary,'#112233');
  assert.equal(saved.generation.system.id,system.system.id);
  assert.match((await svc.printable(A,created.id,1)).html,/--artifact-color-primary: #112233/);
  const exported=await svc.export(A,created.id,'html',1);
  assert.match(Buffer.from(exported.data,'base64').toString(),/--artifact-color-primary: #112233/);
  assert.notEqual((await svc.designSystem(A)).tokens.colors.primary,'#112233');
});

test('SNAP-AC-010: adopting a legacy system leaves the singleton bytes untouched', async t => {
  const {svc}=await fixture(t);
  const legacy=await svc.saveDesignSystem(A,{name:'Legacy Brand',colors:{primary:'#123456'}});
  assert.equal(legacy.scope,'workspace');
  const file=path.join((await svc.root(A)).root,'design-system.json');
  const bytes=await fs.readFile(file,'utf8');
  const adopted=await svc.saveDesignSystem(A,{},{createNew:true,expectedRevision:0});
  assert.equal(adopted.system.name,'Legacy Brand');
  assert.equal(adopted.tokens.colors.primary,'#123456');
  assert.equal(await fs.readFile(file,'utf8'),bytes);
  assert.equal((await svc.designSystem(A)).tokens.colors.primary,'#123456');
});

test('SNAP-AC-006: stale catalog writes and an owned lock both fail closed', async t => {
  const {svc}=await fixture(t);
  const one=await svc.saveDesignSystem(A,{name:'One',colors:{primary:'#112233'}},{createNew:true,expectedRevision:0,makeDefault:true});
  await rejectsCode(svc.setDesignDefault(A,one.system.id,0),'artifact/stale-catalog');
  assert.equal((await svc.listDesignSystems(A)).defaultId,one.system.id);
  await rejectsCode(svc.saveDesignSystem(A,{name:'Two'},{createNew:true,expectedRevision:0}),'artifact/stale-catalog');
  assert.equal((await svc.listDesignSystems(A)).systems.length,1);
  const root=await svc.root(A);
  const indexFile=path.join(root.root,'design-systems/index.json');
  const before=await fs.readFile(indexFile,'utf8');
  const lock=indexFile+'.write-lock';
  await fs.writeFile(lock,'held');
  await rejectsCode(svc.saveDesignSystem(A,{name:'Locked'},{createNew:true,expectedRevision:1}),'artifact/writer-busy');
  assert.equal(await fs.readFile(indexFile,'utf8'),before);
  assert.equal(await fs.readFile(lock,'utf8'),'held');
  await fs.rm(lock);
  assert.equal((await svc.saveDesignSystem(A,{name:'Locked'},{createNew:true,expectedRevision:1})).system.name,'Locked');
  const created=await svc.create(A,{type:'page',title:'Locked',content:page,source});
  const artifactLock=path.join(root.root,created.id+'.write-lock');
  await fs.writeFile(artifactLock,'held');
  await rejectsCode(svc.update(A,created.id,{baseVersion:1,content:page+'<p>no</p>',source}),'artifact/writer-busy');
  assert.equal((await svc.read(A,created.id)).version,1);
  await fs.rm(artifactLock);
  await svc.update(A,created.id,{baseVersion:1,content:page+'<p>yes</p>',source});
  assert.equal((await svc.read(A,created.id)).version,2);
});

test('SNAP-AC-011: tampered historical content is corruption, not a fallback', async t => {
  const {svc}=await fixture(t);
  const created=await svc.create(A,{type:'page',title:'History',content:page,source});
  await svc.update(A,created.id,{baseVersion:1,content:page+'<p>Two</p>',source});
  const root=await svc.root(A);
  await fs.writeFile(path.join(root.root,created.id,'versions/1/content/index.html'),'<h1>Tampered</h1>');
  await rejectsCode(svc.read(A,created.id,1),'artifact/corrupt');
  await rejectsCode(svc.restore(A,created.id,1,source),'artifact/corrupt');
  const current=await svc.read(A,created.id);
  assert.equal(current.version,2);
  assert.equal(current.content,page+'<p>Two</p>');
});

test('SNAP-AC-001: a selected catalog revision resolves and verifies its own bytes', async t => {
  const {svc}=await fixture(t);
  const first=await svc.saveDesignSystem(A,{name:'Brand',colors:{primary:'#112233'}},{createNew:true,expectedRevision:0,makeDefault:true});
  const second=await svc.saveDesignSystem(A,{colors:{primary:'#445566'}},{systemId:first.system.id,expectedRevision:1});
  assert.equal(second.system.revision,2);
  assert.equal((await svc.designSystem(A,{systemId:first.system.id,revision:1})).tokens.colors.primary,'#112233');
  assert.equal((await svc.designSystem(A,{systemId:first.system.id,revision:2})).tokens.colors.primary,'#445566');
  assert.equal((await svc.designSystem(A,{systemId:first.system.id})).tokens.colors.primary,'#445566');
  await rejectsCode(svc.designSystem(A,{systemId:first.system.id,revision:3}),'artifact/not-found');
  await rejectsCode(svc.designSystem(A,{systemId:first.system.id,revision:0}),'artifact/not-found');
  const root=await svc.root(A);
  const file=path.join(root.root,'design-systems',first.system.id,'1.json');
  const original=await fs.readFile(file,'utf8');
  await fs.writeFile(file,original.replace('#112233','#ff00ff'));
  await rejectsCode(svc.designSystem(A,{systemId:first.system.id,revision:1}),'artifact/corrupt');
});

test('SNAP-AC-004: the pinned recipe survives guide replacement and removal', async t => {
  const {svc}=await fixture(t);
  const first=await svc.create(A,{type:'page',title:'First',content:page,recipe:'feature-spec',source});
  const saved=await svc.read(A,first.id);
  assert.equal(saved.generation.recipe,'feature-spec');
  assert.equal((await svc.recipeOf(A,saved.manifest)).name,'Feature specification');
  const digest=saved.generation.hash;
  await svc.saveGuide(A,{recipe:{id:'feature-spec',name:'Project feature',types:['page'],audience:'The team',purpose:'Project version',sections:[],rules:['Project rule']}});
  const still=await svc.read(A,first.id);
  assert.equal(still.generation.hash,digest);
  const pinned=await svc.recipeOf(A,still.manifest);
  assert.equal(pinned.name,'Feature specification');
  assert.notDeepEqual(pinned.rules,['Project rule']);
  const second=await svc.create(A,{type:'page',title:'Second',content:page,recipe:'feature-spec',source});
  assert.equal((await svc.recipeOf(A,(await svc.read(A,second.id)).manifest)).name,'Project feature');
  await svc.saveGuide(A,{removeRecipe:'feature-spec'});
  assert.equal((await svc.recipeOf(A,(await svc.read(A,first.id)).manifest)).name,'Feature specification');
  assert.equal((await svc.recipeOf(A,(await svc.read(A,second.id)).manifest)).name,'Project feature');
  assert.equal((await svc.read(A,first.id)).generation.hash,digest);
});
