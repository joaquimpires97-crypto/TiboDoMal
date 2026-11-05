const $ = selector => document.querySelector(selector);
const gate = $('#gate');
const game = $('#game');
const form = $('#join-form');
const nameInput = $('#player-name');
const codeInput = $('#room-code');
const errorLabel = $('#gate-error');
const actionArea = $('#action-area');
const journal = $('#journal');
let session = null;
let state = null;
let pollTimer = null;
let busy = false;
let toastTimer;
let seenLogIds = new Set();
const playerId = sessionStorage.getItem('wayfarer-player-id') || createId();
sessionStorage.setItem('wayfarer-player-id', playerId);

function createId() {
  return (globalThis.crypto?.randomUUID?.() || `traveler-${Math.random().toString(36).slice(2)}-${Date.now()}`).slice(0, 50);
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The trail is quiet. Try again.');
  return data;
}
function saveSession() {
  localStorage.setItem('wayfarer-room', JSON.stringify(session));
}
async function enterJourney(name, code = '') {
  const result = await request('/api/join', { method: 'POST', body: JSON.stringify({ name, code, playerId }) });
  session = { code: result.room.code, name, playerId };
  saveSession();
  state = result.room;
  seenLogIds = new Set();
  gate.classList.add('hidden');
  game.classList.remove('hidden');
  render();
  startPolling();
}
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, 1700);
}
async function poll() {
  if (!session || busy || document.hidden) return;
  try {
    const result = await request(`/api/room?code=${encodeURIComponent(session.code)}&playerId=${encodeURIComponent(session.playerId)}`);
    state = result.room;
    render();
  } catch (error) {
    clearInterval(pollTimer);
    session = null;
    localStorage.removeItem('wayfarer-room');
    game.classList.add('hidden');
    gate.classList.remove('hidden');
    errorLabel.textContent = error.message;
  }
}
function safeNumber(value, length = 2) { return String(value).padStart(length, '0'); }
function addJournalEntry(entry) {
  const article = document.createElement('article');
  article.className = `journal-entry ${entry.kind || ''}`;
  const time = document.createElement('span');
  time.className = 'journal-time';
  time.textContent = entry.author === 'FIELD NOTE' ? 'NOTE' : `D${safeNumber(entry.day ?? state.day)}`;
  const content = document.createElement('div');
  content.className = 'journal-text';
  if (entry.author && entry.author !== 'FIELD NOTE') {
    const author = document.createElement('span');
    author.className = 'journal-author';
    author.textContent = entry.author.toUpperCase();
    content.append(author);
  } else if (entry.author === 'A MOMENT ON THE ROAD') {
    const author = document.createElement('span');
    author.className = 'journal-author';
    author.textContent = entry.author;
    content.append(author);
  }
  const text = document.createElement('span');
  text.textContent = entry.text;
  content.append(text);
  article.append(time, content);
  journal.append(article);
}
function renderJournal() {
  const nearBottom = journal.scrollHeight - journal.scrollTop - journal.clientHeight < 60;
  journal.replaceChildren();
  state.log.forEach(entry => addJournalEntry(entry));
  $('#journal-count').textContent = `FIELD NOTES · ${safeNumber(state.log.length)}`;
  if (nearBottom || seenLogIds.size === 0) journal.scrollTop = journal.scrollHeight;
  seenLogIds = new Set(state.log.map(entry => entry.id));
}
function renderRoute() {
  const route = $('#route-strip');
  route.replaceChildren();
  state.stops.forEach((stop, index) => {
    const point = document.createElement('div');
    point.className = `route-stop${index < state.distance ? ' done' : ''}${index === state.distance ? ' current' : ''}`;
    const marker = document.createElement('span'); marker.className = 'route-point';
    const label = document.createElement('span'); label.className = 'route-name'; label.textContent = stop;
    point.append(marker, label); route.append(point);
  });
  $('#location-title').textContent = state.stops[state.distance] || 'The long way home';
  $('#location-caption').textContent = state.captions[state.distance] || 'The road remembers every footstep.';
  $('#map-location').textContent = (state.stops[state.distance] || 'HOME').toUpperCase();
  $('#map-progress').textContent = `${safeNumber(state.distance)} / ${safeNumber(state.stops.length - 1)}`;
  const position = 15 + (state.distance / (state.stops.length - 1)) * 67;
  $('#map-you').style.left = `${position}%`;
  $('#map-you').style.top = `${50 - (state.distance / (state.stops.length - 1)) * 25}%`;
}
function renderParty() {
  const list = $('#party-list');
  list.replaceChildren();
  state.players.forEach(player => {
    const row = document.createElement('div');
    row.className = `party-member${player.online ? '' : ' away'}`;
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = player.name.trim().slice(0, 1).toUpperCase();
    const name = document.createElement('span'); name.textContent = player.name + (player.id === session.playerId ? ' (you)' : '');
    const role = document.createElement('span'); role.className = 'party-role'; role.textContent = player.id === session.playerId ? 'YOU' : (player.acted ? 'READY' : player.online ? 'ON THE TRAIL' : 'AWAY');
    row.append(avatar, name, role); list.append(row);
  });
  $('#party-count').textContent = `${safeNumber(state.activeCount || state.partyCount)} / 06`;
  const status = $('#turn-status');
  if (state.state !== 'playing') status.innerHTML = state.state === 'won' ? '<b>The journey is complete.</b> A road made together.' : '<b>The trail has gone quiet.</b> Begin again when you are ready.';
  else if (state.meActed) status.innerHTML = `<b>Your part is done for today.</b> ${Math.max(0, state.players.filter(player => player.online && !player.acted).length)} traveler${state.players.filter(player => player.online && !player.acted).length === 1 ? '' : 's'} still to act.`;
  else status.innerHTML = '<b>Your turn on the trail.</b> Choose one thing for the party to do.';
}
function buttonCard({ icon, title, detail, action, event = false, disabled = false }) {
  const button = document.createElement('button');
  button.className = `action-card${event ? ' encounter-choice' : ''}`;
  button.type = 'button'; button.dataset.action = action; button.disabled = disabled || busy;
  const symbol = document.createElement('span'); symbol.className = 'action-icon'; symbol.textContent = icon;
  const label = document.createElement('strong'); label.textContent = title;
  const description = document.createElement('small'); description.textContent = detail;
  button.append(symbol, label, description);
  return button;
}
function renderActions() {
  actionArea.replaceChildren();
  const title = document.createElement('div'); title.className = 'action-title';
  const heading = document.createElement('strong'); heading.textContent = state.pending ? state.pending.title : state.state === 'won' ? 'The last page' : state.state === 'lost' ? 'An unfinished chapter' : state.meActed ? 'The party is on the move' : 'What will you do today?';
  const note = document.createElement('span'); note.textContent = state.state === 'playing' ? (state.meActed ? 'WAITING FOR YOUR PARTY' : 'ONE CHOICE · PER TRAVELER · PER DAY') : 'THE LONG WAY HOME';
  title.append(heading, note); actionArea.append(title);
  if (state.state !== 'playing') {
    const panel = document.createElement('div'); panel.className = 'finished-panel';
    const text = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = state.state === 'won' ? 'You made it home.' : 'The party needs a little more heart.';
    const small = document.createElement('small'); small.textContent = state.state === 'won' ? `${state.distance} miles, ${state.insight} clues, and a story all your own.` : 'Leave this room and start a fresh journey whenever you like.';
    text.append(strong, small); panel.append(text); actionArea.append(panel); return;
  }
  if (state.meActed) {
    const panel = document.createElement('div'); panel.className = 'wait-panel';
    const text = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = 'Your footprints are in the journal.';
    const small = document.createElement('small'); small.textContent = 'The next morning comes when everyone has had their say.';
    text.append(strong, small); const icon = document.createElement('span'); icon.className = 'wait-icon'; icon.textContent = '☼'; panel.append(text, icon); actionArea.append(panel); return;
  }
  const grid = document.createElement('div'); grid.className = 'action-grid';
  if (state.pending) {
    state.pending.options.forEach((option, index) => {
      const disabled = (state.food + option.food < 0) || (state.insight + option.insight < 0);
      grid.append(buttonCard({ icon: option.icon, title: option.label, detail: option.detail, action: `event-${index}`, event: true, disabled }));
    });
    actionArea.append(grid); return;
  }
  const actions = [
    { icon: '↗', title: 'Travel onward', detail: 'Walk a mile · costs 2 provisions', action: 'travel', disabled: state.food < 2 || state.distance >= state.stops.length - 1 },
    { icon: '✳', title: 'Gather provisions', detail: 'Forage · adds 4 provisions', action: 'forage' },
    { icon: '⌂', title: 'Make a proper camp', detail: 'Rest · restores 2 party spirit', action: 'rest' },
    { icon: '⌕', title: 'Study the map', detail: 'Scout · discover 1 clue', action: 'scout' }
  ];
  actions.forEach(action => grid.append(buttonCard(action)));
  actionArea.append(grid);
}
function render() {
  if (!state || !session) return;
  $('#top-room').textContent = `ROOM ${state.code}`;
  $('#share-code').textContent = state.code;
  $('#day-label').textContent = `DAY ${safeNumber(state.day)}`;
  $('#weather-tag').textContent = state.weather;
  $('#food-value').textContent = safeNumber(state.food);
  $('#morale-value').textContent = safeNumber(state.morale);
  $('#food-meter').style.width = `${Math.max(0, Math.min(100, state.food / 30 * 100))}%`;
  $('#morale-meter').style.width = `${Math.max(0, Math.min(100, state.morale * 10))}%`;
  $('#insight-value').textContent = `${state.insight} ${state.insight === 1 ? 'clue' : 'clues'}`;
  renderRoute(); renderJournal(); renderParty(); renderActions();
}
async function takeAction(action) {
  if (busy || !session) return;
  busy = true;
  renderActions();
  try {
    const result = await request('/api/action', { method: 'POST', body: JSON.stringify({ code: session.code, playerId: session.playerId, action }) });
    state = result.room;
    render();
  } catch (error) {
    showToast(error.message);
    await poll();
  } finally { busy = false; renderActions(); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorLabel.textContent = '';
  const name = nameInput.value.trim();
  if (!name) { errorLabel.textContent = 'Give your traveler a name first.'; return; }
  try {
    const code = codeInput.value.trim().toUpperCase();
    await enterJourney(name, code);
  } catch (error) { errorLabel.textContent = error.message; }
});
$('#room-random').addEventListener('click', () => { codeInput.value = ''; codeInput.focus(); showToast('Leave the code blank to create a fresh room.'); });
codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
actionArea.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) takeAction(button.dataset.action);
});
$('#copy-room').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.code); showToast('Room code copied — invite your party.'); }
  catch { showToast(`Your room code is ${state.code}`); }
});
$('#leave-button').addEventListener('click', async () => {
  if (!session) return;
  const leaving = session;
  clearInterval(pollTimer);
  try { await request('/api/leave', { method: 'POST', body: JSON.stringify({ ...leaving }) }); } catch {}
  session = null; state = null; localStorage.removeItem('wayfarer-room');
  game.classList.add('hidden'); gate.classList.remove('hidden');
  nameInput.value = leaving.name; codeInput.value = '';
});

(async function resumeJourney() {
  nameInput.value = localStorage.getItem('wayfarer-name') || '';
  const saved = localStorage.getItem('wayfarer-room');
  if (!saved) return;
  try {
    const previous = JSON.parse(saved);
    if (!previous?.name || !previous?.code) return;
    session = { ...previous, playerId };
    const result = await request('/api/join', { method: 'POST', body: JSON.stringify({ name: session.name, code: session.code, playerId }) });
    state = result.room; session = { code: state.code, name: session.name, playerId }; saveSession();
    gate.classList.add('hidden'); game.classList.remove('hidden'); render(); startPolling();
  } catch { localStorage.removeItem('wayfarer-room'); }
})();
form.addEventListener('submit', () => localStorage.setItem('wayfarer-name', nameInput.value.trim()));
