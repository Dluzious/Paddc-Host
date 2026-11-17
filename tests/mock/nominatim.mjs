import http from 'node:http';
let n = 0;
http.createServer((req, res) => {
  n++; const u = new URL(req.url, 'http://x');
  console.log('GEO', n, u.searchParams.get('q'), req.headers['user-agent']);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify([{ name: 'Padel Doc Arena', display_name: 'Padel Doc Arena, Jalan Siliwangi, Tawang, Tasikmalaya, Jawa Barat, Indonesia', lat: '-7.3274', lon: '108.2207' },
    { name: '', display_name: 'Jalan Padel, Cihideung, Tasikmalaya, Jawa Barat, Indonesia', lat: '-7.33', lon: '108.22' }]));
}).listen(9912, '127.0.0.1', () => console.log('mock nominatim on 9912'));
