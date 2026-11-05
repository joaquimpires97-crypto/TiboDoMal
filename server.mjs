import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const stops = ['The Ember Ferry', 'The Bracken Mile', 'Glasswater Ford', 'Bellweather', 'The Old Observatory', 'Home'];
const captions = ['Where the old road begins to disappear.', 'A green corridor, tangled with old stories.', 'The river keeps a thousand borrowed skies.', 'A village built to listen for the wind.', 'A quiet place above the clouds.', 'The long way home, made shorter together.'];
const weather = ['CLEAR SKIES', 'A SOFT DRIZZLE', 'WIND FROM THE WEST', 'LOW MIST', 'GOLDEN AFTERNOON'];
const encounters = {
  1: { title: 'The lantern post', text: 'At the first bend, a lantern burns in an empty post. Its warm light points toward a narrow path through the ferns. The old road goes the other way.', options: [{ label: 'Follow the little light', icon: '✦', detail: 'Spend 1 provision · lift party spirit', food: -1, morale: 2, insight: 0, text: 'You follow the lantern through the ferns. Someone has left a tiny painted star on the next stone.' }, { label: 'Keep to the old road', icon: '↗', detail: 'Read the old markers · gain 2 clues', food: 0, morale: -1, insight: 2, text: 'The old mile markers tell their story in worn symbols. You copy them into the journal.' }] },
  2: { title: 'Glasswater crossing', text: 'Glasswater is running high. A half-sunken stone bridge crosses upstream; closer by, the river opens into a shallow, pebbled ford.', options: [{ label: 'Try the stone bridge', icon: '⌁', detail: 'A careful crossing · gain a clue', food: -2, morale: 0, insight: 1, text: 'The bridge holds. In the stonework you find a map scratched by someone who came before.' }, { label: 'Wade through the ford', icon: '≈', detail: 'Find fresh water · spend 1 spirit', food: 2, morale: -1, insight: 0, text: 'Cold water to your knees, clear water in your bottles. The far bank is closer than it looked.' }] },
  3: { title: 'The quiet caravan', text: 'A little caravan is resting beneath a cedar. Its travelers have warm tea, patched coats, and no interest in hurrying.', options: [{ label: 'Trade stories over tea', icon: '☼', detail: 'A good conversation · spirit +2, clue +1', food: 0, morale: 2, insight: 1, text: 'You share a story apiece. By the time the kettle cools, the road feels friendlier.' }, { label: 'Trade for their provisions', icon: '⇄', detail: 'Give 2 clues · gain 4 provisions', food: 4, morale: 0, insight: -2, text: 'A fair trade, sealed with a handshake. The caravan points you toward the western ridge.' }] },
  4: { title: 'The old observatory', text: 'The observatory sits above the cloudline, its brass dome open to the evening. A narrow stair climbs to the roof; a sheltered courtyard waits below.', options: [{ label: 'Climb to the roof', icon: '↑', detail: 'Spend 2 spirit · find 2 clues', food: 0, morale: -2, insight: 2, text: 'From the roof, the whole road reveals itself. You sketch the last miles before the clouds drift in.' }, { label: 'Rest in the courtyard', icon: '⌂', detail: 'Settle in · lift party spirit', food: 0, morale: 2, insight: 0, text: 'You rest in the sheltered courtyard, listening to the dome hum softly in the wind.' }] }
};

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(5), byte => alphabet[byte % alphabet.length]).join('');
}
function addLog(room, text, author = 'FIELD NOTE', kind = 'system') {
  room.log.push({ id: randomBytes(5).toString('hex'), text, author, kind, day: room.day, time: Date.now() });
  if (room.log.length > 70) room.log.splice(0, room.log.length - 70);
}
function createRoom(code) {
  return { code, created: Date.now(), day: 1, distance: 0, food: 16, morale: 8, insight: 0, state: 'playing', weather: weather[0], acted: [], pending: null, resolved: [], players: [], log: [{ id: 'welcome', text: 'The map ends here. Six pencilled miles lead into the wilds, and a small ferry waits at the water’s edge. The road is yours to make.', author: 'FIELD NOTE', kind: 'system', day: 1, time: Date.now() }] };
}
function cleanRoom(room) {
  const now = Date.now();
  room.players = room.players.filter(player => now - player.seen < 24 * 60 * 60 * 1000);
}
function viewRoom(room, playerId) {
  cleanRoom(room);
  const now = Date.now();
  const online = room.players.filter(player => now - player.seen < 18000);
  return {
    code: room.code, day: room.day, distance: room.distance, food: room.food, morale: room.morale, insight: room.insight,
    state: room.state, weather: room.weather, stops, captions, log: room.log, pending: room.pending,
    players: room.players.map(player => ({ id: player.id, name: player.name, online: now - player.seen < 18000, acted: room.acted.includes(player.id) })),
    partyCount: Math.max(1, online.length), meActed: room.acted.includes(playerId),
    activeCount: online.length, resolved: room.resolved
  };
}
function advanceDay(room) {
  if (room.state !== 'playing') return;
  const online = room.players.filter(player => Date.now() - player.seen < 18000);
  if (!online.length || !online.every(player => room.acted.includes(player.id))) return;
  if (room.distance >= stops.length - 1) {
    room.state = 'won';
    addLog(room, 'The last hill falls away. There you are: home, with the whole road behind you and one another beside you.', 'FIELD NOTE', 'highlight');
    return;
  }
  room.day += 1;
  room.acted = [];
  const ration = Math.max(1, online.length);
  const spent = Math.min(room.food, ration);
  room.food -= spent;
  if (spent < ration) {
    room.morale = Math.max(0, room.morale - (ration - spent));
    addLog(room, 'Dawn arrives, but there are not enough provisions for everyone. The quiet is harder to carry.', 'FIELD NOTE', 'event');
  } else {
    addLog(room, `Dawn. ${ration} ${ration === 1 ? 'ration is' : 'rations are'} shared around the campfire.`, 'FIELD NOTE', 'system');
  }
  room.weather = weather[(room.day - 1) % weather.length];
  if (room.morale <= 0) {
    room.state = 'lost';
    addLog(room, 'The party has run out of heart. The road will wait here until you are ready to try again.', 'FIELD NOTE', 'event');
  }
}
function applyAction(room, player, action) {
  const name = player.name;
  if (action === 'travel') {
    if (room.distance >= stops.length - 1) throw new Error('You have reached the end of the road.');
    if (room.food < 2) throw new Error('You need 2 provisions to travel. Gather some first.');
    room.food -= 2;
    room.distance += 1;
    addLog(room, `${name} leads the party onward, following the path toward ${stops[room.distance]}. Two provisions go into the pack; the map gains another mile.`, name, 'highlight');
    if (encounters[room.distance] && !room.resolved.includes(room.distance)) {
      room.pending = { distance: room.distance, ...encounters[room.distance] };
      addLog(room, encounters[room.distance].text, 'A MOMENT ON THE ROAD', 'event');
    }
  } else if (action === 'forage') {
    room.food = Math.min(30, room.food + 4);
    addLog(room, `${name} gathers wild pears and a handful of good roots. The party adds 4 provisions.`, name, 'highlight');
  } else if (action === 'rest') {
    const before = room.morale;
    room.morale = Math.min(10, room.morale + 2);
    addLog(room, `${name} makes a proper camp. A hot drink and a little rest bring the party spirit to ${room.morale}${before === room.morale ? ' (already full)' : ' (+2)'}.`, name, 'highlight');
  } else if (action === 'scout') {
    room.insight += 1;
    addLog(room, `${name} studies the folds of the land and marks a detail the map had missed. The party gains a clue.`, name, 'highlight');
  } else if (action.startsWith('event-')) {
    if (!room.pending) throw new Error('That moment has already passed.');
    const option = room.pending.options[Number(action.slice(6))];
    if (!option) throw new Error('That choice is not available.');
    if (room.food + option.food < 0) throw new Error('The party does not have enough provisions for that choice.');
    if (room.insight + option.insight < 0) throw new Error('You need more clues to make that trade.');
    room.food = Math.max(0, room.food + option.food);
    room.morale = Math.max(0, Math.min(10, room.morale + option.morale));
    room.insight = Math.max(0, room.insight + option.insight);
    addLog(room, option.text, name, 'highlight');
    room.resolved.push(room.pending.distance);
    room.pending = null;
    if (room.morale <= 0) room.state = 'lost';
  } else {
    throw new Error('Choose an action from the field guide.');
  }
  room.acted.push(player.id);
  advanceDay(room);
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 10000) throw new Error('Request is too large.'); }
  return body ? JSON.parse(body) : {};
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST' && url.pathname === '/api/join') {
        const body = await readBody(req);
        const name = String(body.name || '').trim().slice(0, 18);
        const playerId = String(body.playerId || '').slice(0, 50);
        if (!name || !playerId) return send(res, 400, { error: 'Choose a traveler name to begin.' });
        let room;
        let code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (code) {
          room = rooms.get(code);
          if (!room) return send(res, 404, { error: `No open journey found for ${code}. Check the room code and try again.` });
        } else {
          do { code = makeRoomCode(); } while (rooms.has(code));
          room = createRoom(code);
          rooms.set(code, room);
        }
        cleanRoom(room);
        let player = room.players.find(item => item.id === playerId);
        if (!player && room.players.length >= 6) return send(res, 409, { error: 'This party is full. A journey can hold up to 6 travelers.' });
        if (!player) {
          player = { id: playerId, name, joined: Date.now(), seen: Date.now() };
          room.players.push(player);
          addLog(room, `${name} joins the party. The map has room for one more story.`, name, 'system');
        } else player.name = name;
        player.seen = Date.now();
        return send(res, 200, { room: viewRoom(room, playerId), playerId });
      }
      if (req.method === 'GET' && url.pathname === '/api/room') {
        const code = String(url.searchParams.get('code') || '').toUpperCase();
        const playerId = String(url.searchParams.get('playerId') || '');
        const room = rooms.get(code);
        if (!room) return send(res, 404, { error: 'This room is no longer here. Begin a new journey to make another.' });
        const player = room.players.find(item => item.id === playerId);
        if (!player) return send(res, 403, { error: 'You are not part of this journey. Rejoin using its room code.' });
        player.seen = Date.now();
        advanceDay(room);
        return send(res, 200, { room: viewRoom(room, playerId) });
      }
      if (req.method === 'POST' && url.pathname === '/api/action') {
        const body = await readBody(req);
        const room = rooms.get(String(body.code || '').toUpperCase());
        if (!room) return send(res, 404, { error: 'Room not found.' });
        const player = room.players.find(item => item.id === String(body.playerId || ''));
        if (!player) return send(res, 403, { error: 'You are not part of this journey.' });
        player.seen = Date.now();
        if (room.state !== 'playing') return send(res, 409, { error: 'This journey has reached its ending.' });
        if (room.acted.includes(player.id)) return send(res, 409, { error: 'You have already taken your turn. The party is catching up.' });
        try { applyAction(room, player, String(body.action || '')); }
        catch (error) { return send(res, 400, { error: error.message }); }
        return send(res, 200, { room: viewRoom(room, player.id) });
      }
      if (req.method === 'POST' && url.pathname === '/api/leave') {
        const body = await readBody(req);
        const room = rooms.get(String(body.code || '').toUpperCase());
        if (room) {
          room.players = room.players.filter(player => player.id !== String(body.playerId || ''));
          room.acted = room.acted.filter(id => id !== String(body.playerId || ''));
          addLog(room, `${String(body.name || 'A traveler').slice(0, 18)} leaves the trail.`, 'FIELD NOTE', 'system');
          advanceDay(room);
        }
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Not found.' });
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const fullPath = path.resolve(STATIC_DIR, `.${pathname}`);
    if (!fullPath.startsWith(STATIC_DIR + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const file = await readFile(fullPath);
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(fullPath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(file);
  } catch (error) {
    if (error instanceof SyntaxError) return send(res, 400, { error: 'Invalid request.' });
    if (error.code === 'ENOENT') { res.writeHead(404); res.end('Not found'); return; }
    console.error(error);
    send(res, 500, { error: 'Something went wrong on the trail. Please try again.' });
  }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Wayfarer is listening on http://localhost:${PORT}`));
