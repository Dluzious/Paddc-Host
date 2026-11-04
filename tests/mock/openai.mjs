import http from 'node:http';
import fs from 'node:fs';
const pro = fs.readFileSync(process.argv[2]).toString('base64'), chibi = fs.readFileSync(process.argv[3]).toString('base64');
const log = process.argv[4];
http.createServer((req, res) => {
  const body = [];
  req.on('data', (c) => body.push(c));
  req.on('end', () => {
    const txt = Buffer.concat(body).toString('latin1');
    const field = (n) => (txt.match(new RegExp('name="' + n + '"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--')) || [])[1];
    const model = field('model'), prompt = field('prompt') || '', bg = field('background'), fmt = field('output_format');
    const kind = /chibi/i.test(prompt) ? 'chibi' : 'pro';
    res.setHeader('Content-Type', 'application/json');
    let status = 200, out;
    if (model === 'gpt-image-2.5-sunburst') { status = 400; out = { error: { message: "The model 'gpt-image-2.5-sunburst' does not exist" } }; }
    else if (bg === 'transparent') { status = 400; out = { error: { message: 'Transparent background is not supported for this model.' } }; }
    else out = { data: [{ b64_json: kind === 'chibi' ? chibi : pro }] };
    fs.appendFileSync(log, JSON.stringify({ t: Date.now(), kind, model, bg: bg || '', fmt, status, hijab: /hijab: keep/.test(prompt), host: /referee/.test(prompt) }) + '\n');
    setTimeout(() => { res.statusCode = status; res.end(JSON.stringify(out)); }, 150);
  });
}).listen(9911, '127.0.0.1', () => console.log('mock openai 9911'));
