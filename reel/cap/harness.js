// Pasang lobi di halaman demo lokal dengan pemain asli (nama + avatar chibi dari data publik live). Tidak menulis ke server.
const fs = require('fs');
function realPeople() {
  const d = JSON.parse(fs.readFileSync(__dirname + '/../poll.json', 'utf8'));
  const r = (d.data || d).result || d.data || d;
  return r.people.filter(p => !p.archived && (p.chibiUrl || p.chibiFull) && p.name !== 'Admin')
    .map(p => ({ id: p.id, name: p.name, role: p.role === 'user' ? 'player' : 'host', photo: p.photoUrl, sprite: p.chibiUrl || p.chibiFull }));
}
async function mountLobby(p, o) {
  await p.goto('file://' + require('path').resolve(__dirname, '../../index.html') + '?lobby=demo');
  await p.clock.runFor(1500);
  const people = realPeople();
  await p.evaluate(ps => Promise.all(ps.map(x => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = x.sprite; }))), people);
  await p.evaluate(([people, o]) => {
    Lobby.active.destroy();
    document.querySelector('#app').innerHTML = '<div id="r"></div>';
    const host = people.find(x => x.name === o.host) || people.find(x => x.role === 'host');
    const players = people.filter(x => x.role === 'player');
    const me = players.find(x => x.name === o.me) || players[0];
    const order = [me].concat(players.filter(x => x !== me).sort(() => Math.random() - .5));
    let present = [host], chat = [], cid = 1, started = false;
    const st = () => ({ role: 'player', meId: me.id, me, theme: o.theme, started, themes: [],
      session: { name: 'Paddoc Membara 🔥', kicker: 'Ruang tunggu · Americano · 3 court', whenText: 'Selasa, 20 Oktober 2026 · 20.00–23.00 WIB', startAt: Date.now() + o.countdown * 1000,
        venue: { name: 'PadelDoc', address: 'Jl. Mayor Elang Subandar No. 32, Cipedes, Tasikmalaya' }, url: location.href, price: 'Rp135.000' },
      people: present.slice(), chat: chat.slice() });
    const h = { join(){}, leave(){}, remove(){}, add(){}, start(){}, back(){}, theme(){}, chat(){}, login(){}, playLocal: true, frame(){} };
    const inst = Lobby.mount(document.querySelector('#r'), st(), h);
    window.__join = n => { present = present.concat(order.filter(x => present.indexOf(x) < 0).slice(0, n)); inst.update(st()); };
    window.__say = (name, text) => { const who = present.find(x => x.name === name) || present[1]; chat.push({ id: 'c' + cid++, pid: who.id, name: who.name, role: who.role, text, at: Date.now() }); inst.update(st()); };
    window.__start = () => { started = true; inst.update(st()); };
    window.__tap = sel => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 })); el.click(); return true; };
  }, [people, o]);
  return people;
}
module.exports = { realPeople, mountLobby };
