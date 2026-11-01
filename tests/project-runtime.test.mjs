import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
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
