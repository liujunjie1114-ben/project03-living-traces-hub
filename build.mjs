import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
const from = path => new URL(path, import.meta.url);
const read = path => readFile(from(path), 'utf8');
const catalog = JSON.parse(await read('./src/catalog.json'));
const tracks = JSON.parse(await read('./src/workstreams.json'));
const html = await read('./src/index.html');
const css = await read('./src/site.css');
const app = await read('./src/workspace-ui.js')+'\n'+await read('./src/app.js');
const server = await read('./src/worker.js');
const workstreams = await read('./src/workstreams.js');
await mkdir(from('./dist/server/'), {recursive:true});
await mkdir(from('./dist/.openai/'), {recursive:true});
await writeFile(from('./dist/server/index.js'),
  'const CATALOG='+JSON.stringify(catalog)+';\nconst WORKSTREAMS='+JSON.stringify(tracks)+';\nconst UI='+JSON.stringify({html,css,app})+';\n'+workstreams+'\n'+server);
await copyFile(from('./.openai/hosting.json'), from('./dist/.openai/hosting.json'));

