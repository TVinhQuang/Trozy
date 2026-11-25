import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectDirectory,projectRoot} from '../src/shared/project-paths.mjs';

test('project runtime paths survive a Unicode project directory and reject storage outside it',()=>{
 assert.equal(projectDirectory('.runtime/ollama'),resolve(projectRoot,'.runtime/ollama'));
 assert.equal(projectDirectory(projectRoot),null);
 assert.equal(projectDirectory('..'),null);
 assert.equal(projectDirectory(join(dirname(projectRoot),'Trozy-external-runtime')),null);
});

for(const exitCode of [0,7])test(`project launcher isolates and cleans temporary files after child exit ${exitCode}`,()=>{
 const script='const fs=require("node:fs"),path=require("node:path");fs.writeFileSync(path.join(process.env.TEMP,"owned-temporary.txt"),"temporary");console.log(JSON.stringify({directory:process.env.TEMP,tmp:process.env.TMP,tmpdir:process.env.TMPDIR,cache:process.env.NPM_CONFIG_CACHE}));process.exit('+exitCode+');';
 const result=spawnSync(process.execPath,[join(projectRoot,'scripts/run-project.mjs'),'-e',script],{cwd:projectRoot,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.status,exitCode,result.stderr||result.error?.message);
 const observed=JSON.parse(result.stdout.trim());
 assert.equal(projectDirectory(observed.directory),observed.directory);
 assert.equal(observed.directory,observed.tmp);assert.equal(observed.directory,observed.tmpdir);
 assert.equal(observed.cache,resolve(projectRoot,'.cache/npm'));
 assert.equal(existsSync(observed.directory),false,'The launcher deletes only its completed child task temporary directory.');
});

const python=resolve(projectRoot,`.runtime/meter-digits/visionstate-yolo/python/${process.platform==='win32'?'python.exe':'bin/python3'}`);
for(const exitCode of [0,7])test(`Python launcher executes the portable runtime and cleans temporary files after exit ${exitCode}`,{skip:!existsSync(python)},t=>{
 const parent=resolve(projectRoot,'tmp');mkdirSync(parent,{recursive:true});
 const directory=mkdtempSync(join(parent,'python-launcher-'));
 t.after(()=>{
  assert.equal(projectDirectory(directory),directory);assert.equal(dirname(directory),parent);
  rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 });
 const script=join(directory,'runtime-check.py');
 writeFileSync(script,[
  'import json, os, pathlib, sys',
  'pathlib.Path(os.environ["TEMP"], "owned-temporary.txt").write_text("temporary")',
  'print(json.dumps({"directory":os.environ["TEMP"],"tmp":os.environ["TMP"],"tmpdir":os.environ["TMPDIR"],"cache":os.environ["NPM_CONFIG_CACHE"],"executable":sys.executable,"args":sys.argv[1:],"noBytecode":sys.dont_write_bytecode}))',
  `sys.exit(${exitCode})`,
 ].join('\n'));
 const result=spawnSync(process.execPath,[join(projectRoot,'scripts/run-project.mjs'),'--python',script,'meter check','điện nước'],{cwd:projectRoot,encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,PYTHONUTF8:'1'}});
 assert.equal(result.status,exitCode,result.stderr||result.error?.message);
 const observed=JSON.parse(result.stdout.trim());
 assert.equal(resolve(observed.executable),python);assert.equal(observed.noBytecode,true);
 assert.deepEqual(observed.args,['meter check','điện nước']);
 assert.equal(projectDirectory(observed.directory),observed.directory);
 assert.equal(observed.directory,observed.tmp);assert.equal(observed.directory,observed.tmpdir);
 assert.equal(observed.cache,resolve(projectRoot,'.cache/npm'));
 assert.equal(existsSync(observed.directory),false,'The launcher cleans its Python child temporary directory.');
 assert.equal(existsSync(script),true,'The launcher preserves its source script.');
});

test('Python launcher rejects script paths outside the project and interpreter options',()=>{
 for(const target of [join(dirname(projectRoot),'outside.py'),'-c']){
  const result=spawnSync(process.execPath,[join(projectRoot,'scripts/run-project.mjs'),'--python',target],{cwd:projectRoot,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/A project Python script is required/);
 }
});
