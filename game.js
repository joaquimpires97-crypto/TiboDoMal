(() => {
  const STORE = 'hearthlands-save-v1';
  const now = Date.now();
  const initial = {
    resources: { wood: 1240, stone: 860, iron: 415 }, population: 84,
    buildings: { 'Timber camp': 6, 'Stone quarry': 5, 'Iron mine': 4, 'Longhouse': 3 },
    army: { Spearmen: 24, Scouts: 6, Axemen: 8 },
    orders: [
      { id: 1, type: 'build', name: 'Palisade · Level 4', icon: '▥', duration: 210, start: now - 75_000, end: now + 135_000 },
      { id: 2, type: 'train', name: 'Spearmen · 5', icon: '⚔', unit: 'Spearmen', amount: 5, duration: 300, start: now - 46_000, end: now + 254_000 }
    ],
    reports: [
      { icon: '✦', title: 'A new day in Mosswick', text: 'Your village produced timber, stone, and iron.', time: 'Just now' },
      { icon: '⚑', title: 'Scouts returned from the east', text: 'The old watchtower stands empty. No defenders spotted.', time: '2 hours ago' },
      { icon: '♧', title: 'A message from Kael Reedhand', text: '“The northern road is quiet. For now.”', time: '5 hours ago' }
    ],
    marches: [], lastTick: now, seen: {},
  };
  let state;
  try { state = JSON.parse(localStorage.getItem(STORE)) || initial; } catch { state = initial; }
  state.resources ||= { ...initial.resources }; state.buildings ||= { ...initial.buildings }; state.army ||= { ...initial.army }; state.orders ||= []; state.reports ||= []; state.marches ||= [];
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const cost = {
    'Palisade': { wood: 180, stone: 120, iron: 25 }, 'Timber camp': { wood: 230, stone: 110, iron: 30 },
    'Stone quarry': { wood: 200, stone: 100, iron: 45 }, 'Iron mine': { wood: 250, stone: 160, iron: 70 },
    'Longhouse': { wood: 280, stone: 180, iron: 35 }, 'Watchtower': { wood: 220, stone: 250, iron: 80 },
    'Spearmen': { wood: 45, stone: 0, iron: 25 }, 'Scouts': { wood: 70, stone: 0, iron: 35 }, 'Axemen': { wood: 55, stone: 0, iron: 45 }
  };
  const rates = () => ({ wood: 32 + Math.max(0, (state.buildings['Timber camp'] || 1) - 6) * 5, stone: 24 + Math.max(0, (state.buildings['Stone quarry'] || 1) - 5) * 4, iron: 16 + Math.max(0, (state.buildings['Iron mine'] || 1) - 4) * 3 });
  function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
  function addReport(icon, title, text) { state.reports.unshift({ icon, title, text, time: 'Just now' }); state.reports = state.reports.slice(0, 15); }
  function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600); }
  function drawBuildings() {
    const icons = { 'Timber camp': '⌁', 'Stone quarry': '⬡', 'Iron mine': '◆', 'Longhouse': '⌂', 'Palisade': '▥', 'Watchtower': '⌖' };
    const names = ['Timber camp', 'Stone quarry', 'Iron mine', 'Longhouse'];
    $('#buildingList').innerHTML = names.map(name => `<div class="building-item"><div class="building-name"><i>${icons[name]}</i>${name}</div><div class="building-level">Level ${state.buildings[name] || 1}</div><div class="building-progress"><i style="width:${Math.min(96, 38 + (state.buildings[name] || 1) * 8)}%"></i></div></div>`).join('');
  }
  function drawOrders() {
    const orders = state.orders.slice(0, 4);
    $('#orderCount').textContent = state.orders.length;
    $('#orderList').innerHTML = orders.length ? orders.map(o => {
      const remaining = Math.max(0, Math.ceil((o.end - Date.now()) / 1000));
      const progress = Math.min(100, Math.max(3, ((o.duration - remaining) / o.duration) * 100));
      const time = remaining > 60 ? `${Math.floor(remaining / 60)}m ${String(remaining % 60).padStart(2, '0')}s` : `${remaining}s`;
      return `<div class="order-item"><span class="order-icon">${o.icon}</span><span class="order-info"><b>${o.name}</b><small>${o.type === 'build' ? 'Construction' : 'Training'}</small></span><span class="order-time">${time}</span><span class="order-progress"><i style="width:${progress}%"></i></span></div>`;
    }).join('') : '<div class="empty-state">No orders underway. Your people are ready.</div>';
    const used = Math.min(5, state.orders.length); $('#ordersFooter').innerHTML = `QUEUE CAPACITY &nbsp; <span class="capacity">${Array.from({ length: 5 }, (_, i) => `<i class="${i >= used ? 'empty' : ''}"></i>`).join('')}</span> &nbsp; ${used} / 5`;
  }
  function drawActivity() {
    $('#activityList').innerHTML = state.reports.slice(0, 3).map(r => `<div class="activity-item"><span class="activity-glyph">${r.icon}</span><span><b>${r.title}</b><p>${r.text}</p></span><time>${r.time}</time></div>`).join('');
  }
  function drawResources() {
    for (const key of ['wood', 'stone', 'iron']) { $(`#${key}Count`).textContent = fmt(state.resources[key]); const meter = document.querySelector(`#${key}Meter`); if (meter) meter.style.width = `${Math.min(100, state.resources[key] / 50)}%`; }
    const ratesNow = rates(); for (const k of Object.keys(ratesNow)) $(`#${k}Rate`).textContent = `+${ratesNow[k]}`;
    $('#popCount').textContent = state.population; $('#popMeter').style.width = `${Math.min(100, state.population / 1.2)}%`;
    $('#villageName').textContent = 'Mosswick'; $('#villageCoords').textContent = '(502, 488) · Your village';
    drawBuildings(); drawOrders(); drawActivity();
  }
  function addOrder(type, name, icon, seconds, payload = {}) {
    if (state.orders.length >= 5) { toast('Your order queue is full.'); return false; }
    const c = cost[name] || { wood: 0, stone: 0, iron: 0 };
    if (Object.keys(c).some(k => state.resources[k] < c[k])) { toast('Not enough resources for that order.'); return false; }
    Object.keys(c).forEach(k => state.resources[k] -= c[k]);
    state.orders.push({ id: Date.now() + Math.random(), type, name, icon, duration: seconds, start: Date.now(), end: Date.now() + seconds * 1000, ...payload });
    save(); drawResources(); toast(`${name} added to village orders.`); return true;
  }
  function completeOrder(o) {
    if (o.type === 'build') {
      const building = o.building || 'Palisade'; state.buildings[building] = (state.buildings[building] || 1) + 1;
      addReport('⌂', `${building} upgraded`, `${building} is now level ${state.buildings[building]}. Your holdfast grows stronger.`);
      toast(`${building} construction is complete.`);
    } else if (o.type === 'train') {
      state.army[o.unit] = (state.army[o.unit] || 0) + o.amount;
      state.population = Math.max(0, state.population - o.amount);
      addReport('⚔', 'Training complete', `${o.amount} ${o.unit.toLowerCase()} joined your forces.`);
      toast(`${o.amount} ${o.unit} are ready in the barracks.`);
    }
  }
  function tick() {
    const stamp = Date.now(); const elapsed = Math.min(28800, Math.max(0, (stamp - (state.lastTick || stamp)) / 1000));
    const r = rates(); for (const k of Object.keys(r)) state.resources[k] = Math.min(5000, state.resources[k] + r[k] * elapsed / 3600);
    state.lastTick = stamp;
    const done = state.orders.filter(o => o.end <= stamp); state.orders = state.orders.filter(o => o.end > stamp); done.forEach(completeOrder);
    const arrivals = state.marches.filter(m => m.returnAt <= stamp); state.marches = state.marches.filter(m => m.returnAt > stamp);
    arrivals.forEach(resolveMarch); drawResources(); save();
    $('#serverTime').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
  }
  function resolveMarch(m) {
    if (m.kind === 'scout') {
      state.army.Scouts = (state.army.Scouts || 0) + m.troops;
      addReport('⌖', `Scouts returned from ${m.target}`, `Your scouts found ${m.defenders ? 'a lightly guarded outpost' : 'the settlement undefended'} and brought back a map of the area.`);
      toast('Scouts have returned with a report.');
    } else {
      const power = m.troops * (m.unit === 'Axemen' ? 2 : 1);
      const wins = power >= m.defenders * 2;
      const survivors = wins ? m.troops : Math.floor(m.troops / 2);
      state.army[m.unit] = (state.army[m.unit] || 0) + survivors;
      if (wins) {
        const loot = Math.min(350, 80 + power * 5); state.resources.wood += loot; state.resources.stone += Math.floor(loot * .6); state.resources.iron += Math.floor(loot * .3);
        addReport('⚔', `Victory at ${m.target}`, `Your warband overcame ${m.defenders} defenders. All ${survivors} ${m.unit.toLowerCase()} returned with ${loot} timber in tribute.`); toast(`Victory! Your warband brought back ${loot} timber.`);
      } else {
        addReport('⚑', `A hard-fought raid at ${m.target}`, `The defenders held. ${survivors} ${m.unit.toLowerCase()} returned weary, but wiser.`); toast('Your warband was repelled. Read the report for details.');
      }
    }
  }
  const backdrop = $('#modalBackdrop');
  function openModal(content) { $('#modalContent').innerHTML = content; backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden', 'false'); }
  function closeModal() { backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden', 'true'); }
  $('#modalClose').addEventListener('click', closeModal); backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  const buildOptions = [
    ['Palisade', '▥', 'Raise the timber walls around your holdfast.', 180, 120, 25],
    ['Timber camp', '⌁', 'Send more woodcutters into the Ironwood.', 230, 110, 30],
    ['Stone quarry', '⬡', 'Cut deep into the hillside for stone.', 200, 100, 45],
    ['Iron mine', '◆', 'Open a new vein beneath the ridge.', 250, 160, 70],
    ['Longhouse', '⌂', 'Make room for more villagers and warriors.', 280, 180, 35],
    ['Watchtower', '⌖', 'See danger coming from farther away.', 220, 250, 80],
  ];
  function showBuild() {
    openModal(`<div class="eyebrow">MOSSWICK · BUILDING</div><h2>What will you raise?</h2><p>Invest your stores in the village. Building orders take time, but the valley rewards patience.</p><div class="modal-options">${buildOptions.map(([n, i, d, w, s, ir]) => `<button class="option-card" data-build="${n}"><span class="option-symbol">${i}</span><span class="option-copy"><b>${n} · Level ${state.buildings[n] || 1}</b><small>${d}</small></span><span class="option-cost">⌁ ${w} &nbsp;⬡ ${s}<small>◆ ${ir} iron</small></span></button>`).join('')}</div><div class="modal-note">Construction time: 3 minutes · Orders are processed in the background.</div>`);
    document.querySelectorAll('[data-build]').forEach(btn => btn.onclick = () => { const name = btn.dataset.build; const seconds = name === 'Watchtower' ? 210 : 180; if (addOrder('build', `${name} · Level ${(state.buildings[name] || 1) + 1}`, buildOptions.find(x => x[0] === name)[1], seconds, { building: name })) closeModal(); });
  }
  function showBarracks() {
    const units = [
      ['Spearmen', '⚔', 'Steadfast defenders. Reliable in a shield wall.', 45, 25, 30, 2],
      ['Scouts', '⌖', 'Quick-footed eyes and ears beyond the border.', 70, 35, 38, 1],
      ['Axemen', '✦', 'Hard-hitting raiders, feared in close combat.', 55, 45, 45, 3]
    ];
    openModal(`<div class="eyebrow">MOSSWICK · BARRACKS</div><h2>Call the warband.</h2><p>Train a unit to defend your village, scout the borderlands, or raid a rival. Training ties up villagers until it is complete.</p><div class="modal-options">${units.map(([n, i, d, w, ir]) => `<button class="option-card" data-unit="${n}"><span class="option-symbol">${i}</span><span class="option-copy"><b>${n} <span style="color:#879382;font-weight:400">· ${state.army[n] || 0} ready</span></b><small>${d}</small></span><span class="option-cost">⌁ ${w}<small>◆ ${ir} iron · 1 unit</small></span></button>`).join('')}</div><div class="modal-note">Train one unit per order · 30–45 seconds · ${Math.max(0, 120 - state.population)} / 120 villagers housed</div>`);
    document.querySelectorAll('[data-unit]').forEach(btn => btn.onclick = () => { const n = btn.dataset.unit; const u = units.find(x => x[0] === n); if (state.population >= 120) { toast('Build a Longhouse to house more villagers.'); return; } if (addOrder('train', `${n} · 1`, u[1], u[5], { unit: n, amount: 1 })) closeModal(); });
  }
  const places = [
    { x: 49, y: 50, type: 'own', name: 'Mosswick', coords: '(502, 488)', owner: 'Runa · The Reedbound', defenders: 0 },
    { x: 21, y: 25, type: 'ally', name: 'Fenwatch', coords: '(499, 484)', owner: 'Kael Reedhand · The Reedbound', defenders: 8 },
    { x: 74, y: 31, type: 'enemy', name: 'Blackbriar', coords: '(506, 485)', owner: 'Vey the Ashen · Crow Company', defenders: 5 },
    { x: 17, y: 72, type: 'enemy', name: 'Old Barrow', coords: '(498, 492)', owner: 'Unclaimed settlement', defenders: 2 },
    { x: 79, y: 76, type: 'ally', name: 'Reedhome', coords: '(507, 492)', owner: 'Mara-of-the-Reeds · The Reedbound', defenders: 10 },
    { x: 62, y: 14, type: 'enemy', name: 'Grimstead', coords: '(504, 482)', owner: 'Hrolf Stonehand · Iron Pact', defenders: 12 },
    { x: 36, y: 83, type: 'enemy', name: 'Hollow Cairn', coords: '(501, 494)', owner: 'Unclaimed settlement', defenders: 0 },
  ];
  const glyphs = { own: '⌂', ally: '♧', enemy: '⌖' };
  function drawMap() {
    const map = $('#miniMap');
    map.innerHTML = Array.from({ length: 35 }, (_, i) => {
      const col = i % 7, row = Math.floor(i / 7); const left = 5 + col * 13.2, top = 4 + row * 18.3;
      return `<button aria-label="Explore map tile ${col + 1}, ${row + 1}" class="map-cell" style="left:${left}%;top:${top}%" data-empty="${i}">${['♠','·','⌁','♠','·','⬡','·'][(i + row) % 7]}</button>`;
    }).join('') + places.map((p, i) => `<button class="map-cell ${p.type}" style="left:${p.x}%;top:${p.y}%" data-place="${i}" aria-label="${p.name}">${glyphs[p.type]}</button>`).join('') + '<span class="map-coords">N ↑ &nbsp; 500, 488</span>';
    map.querySelectorAll('[data-place]').forEach(b => b.onclick = () => inspectPlace(places[+b.dataset.place]));
    map.querySelectorAll('[data-empty]').forEach(b => b.onclick = () => { const n = +b.dataset.empty; openModal(`<div class="eyebrow">BORDERLANDS · UNKNOWN TILE</div><h2>Uncharted ground</h2><p>Coordinates near ( ${499 + n % 7}, ${484 + Math.floor(n / 7)} ). Send scouts from the barracks to learn what lies beyond the tree line.</p><button class="primary-button modal-submit" id="scoutUnknown">Send a scouting party · 1 scout</button>`); $('#scoutUnknown').onclick = () => { launchMarch('scout', 'the unknown border', 'Scouts', 1, 0); closeModal(); }; });
  }
  function inspectPlace(p) {
    if (p.type === 'own') { showVillage(); return; }
    const isEnemy = p.type === 'enemy';
    openModal(`<div class="eyebrow">BORDERLANDS · ${p.coords}</div><h2>${p.name}</h2><p>${p.owner}. ${p.defenders ? `Scouts estimate ${p.defenders} defenders.` : 'No defenders have been sighted.'} The trail is ${p.type === 'ally' ? 'marked with your tribe’s colors.' : 'open through the undergrowth.'}</p><div class="modal-note">${isEnemy ? 'A raid can bring resources, but the valley remembers every act of war.' : 'A fellow Reedbound holdfast. Attacking tribe members is forbidden.'}</div><div class="modal-options">${p.type === 'enemy' ? `<button class="option-card" id="scoutTarget"><span class="option-symbol">⌖</span><span class="option-copy"><b>Send scouts</b><small>Learn their defenses · 1 scout · 30 sec</small></span><span class="option-cost">${state.army.Scouts || 0} ready</span></button><button class="option-card" id="attackTarget"><span class="option-symbol">⚔</span><span class="option-copy"><b>Plan a raid</b><small>Choose a warband · 60 sec there and back</small></span><span class="option-cost">${(state.army.Spearmen || 0) + (state.army.Axemen || 0)} ready</span></button>` : '<div class="empty-state">Your tribe protects this settlement.</div>'}</div>`);
    const scout = $('#scoutTarget'); if (scout) scout.onclick = () => { if (!(state.army.Scouts > 0)) { toast('You need scouts. Train them in the barracks.'); return; } launchMarch('scout', p.name, 'Scouts', 1, p.defenders); closeModal(); };
    const attack = $('#attackTarget'); if (attack) attack.onclick = () => showAttack(p);
  }
  function showAttack(p) {
    const available = { Spearmen: state.army.Spearmen || 0, Axemen: state.army.Axemen || 0 };
    openModal(`<div class="eyebrow">WAR COUNCIL · ${p.coords}</div><h2>Choose your warband.</h2><p>March on ${p.name}. A raid takes one minute to return. Your forces are at your command.</p><div class="form-row"><div class="field"><label>UNIT TYPE</label><select id="attackUnit"><option>Spearmen</option><option>Axemen</option></select></div><div class="field"><label>WARRIORS TO SEND</label><input id="attackCount" type="number" min="1" max="${Math.max(...Object.values(available), 1)}" value="${Math.min(5, Math.max(1, available.Spearmen))}"></div></div><div class="modal-note">Estimated defenders: ${p.defenders} · You can send mixed units by launching separate raids.</div><button class="primary-button modal-submit" id="launchAttack">⚔ &nbsp;March on ${p.name}</button>`);
    $('#launchAttack').onclick = () => { const unit = $('#attackUnit').value, count = Math.floor(+$(' #attackCount'.trim()).value); if (!count || count < 1 || count > (state.army[unit] || 0)) { toast(`You have ${state.army[unit] || 0} ${unit.toLowerCase()} ready.`); return; } state.army[unit] -= count; launchMarch('attack', p.name, unit, count, p.defenders); closeModal(); };
  }
  function launchMarch(kind, target, unit, count, defenders) {
    if (kind === 'scout' && (state.army.Scouts || 0) < count) { toast('You need scouts. Train them in the barracks.'); return false; }
    if (kind === 'scout') state.army.Scouts -= count;
    const duration = kind === 'scout' ? 30 : 60;
    state.marches.push({ kind, target, unit, troops: count, defenders, returnAt: Date.now() + duration * 1000 });
    addReport('⚑', `${kind === 'scout' ? 'Scouts' : 'Warband'} departed`, `${count} ${unit.toLowerCase()} set out for ${target}. They will return in about ${duration} seconds.`);
    save(); drawResources(); toast(`${kind === 'scout' ? 'Scouts' : 'Warband'} have left for ${target}.`);
  }
  function showVillage() {
    openModal(`<div class="eyebrow">YOUR HOLDFAST · MOSSWICK</div><h2>A village taking root.</h2><p>Four generations have raised this settlement from the edge of the Ironwood. Its buildings grow stronger with each order.</p><div class="modal-options">${Object.entries(state.buildings).map(([name, level]) => `<div class="option-card"><span class="option-symbol">${name === 'Timber camp' ? '⌁' : name === 'Stone quarry' ? '⬡' : name === 'Iron mine' ? '◆' : name === 'Longhouse' ? '⌂' : '▥'}</span><span class="option-copy"><b>${name}</b><small>Level ${level}${name === 'Longhouse' ? ` · ${state.population}/120 villagers` : ''}</small></span><span class="option-cost">✦</span></div>`).join('')}</div><div class="modal-note">Village production continues while you are away · Resource storage cap: 5,000 each.</div>`);
  }
  function showReports() {
    openModal(`<div class="eyebrow">THE CHRONICLE · ${state.reports.length} ENTRIES</div><h2>Words carried by the wind.</h2><p>Every dispatch, raid, and change in the valley is recorded here.</p><div class="modal-options">${state.reports.map(r => `<div class="option-card"><span class="option-symbol">${r.icon}</span><span class="option-copy"><b>${r.title}</b><small>${r.text}</small></span><span class="option-cost">${r.time}</span></div>`).join('')}</div>`);
    document.querySelector('.nav-item[data-view="reports"] .unread-dot')?.remove();
  }
  const headings = { overview: ['OVERVIEW', 'The valley remembers.'], village: ['VILLAGE', 'A village taking root.'], map: ['WORLD MAP', 'The valley beyond.'], barracks: ['BARRACKS', 'The warband awaits.'], reports: ['REPORTS', 'Words carried by the wind.'] };
  function navigate(view) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const heading = headings[view]; $('#pageCrumb').textContent = heading[0]; $('#pageTitle').textContent = heading[1];
    if (view === 'village') showVillage(); if (view === 'map') { $('#mapPreview').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Select a nearby settlement to inspect it.'); }
    if (view === 'barracks') showBarracks(); if (view === 'reports') showReports();
  }
  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
  document.querySelectorAll('[data-view="village"]').forEach(b => b.addEventListener('click', () => navigate('village')));
  document.querySelectorAll('[data-view="map"]').forEach(b => b.addEventListener('click', () => navigate('map')));
  document.querySelectorAll('[data-view="reports"]').forEach(b => b.addEventListener('click', () => navigate('reports')));
  $('#quickBuild').onclick = showBuild; $('#addOrder').onclick = showBuild; $('#villageSelect').onclick = showVillage; $('#tribeBtn').onclick = () => openModal(`<div class="eyebrow">TRIBE HALL · ALLIANCE</div><h2>The Reedbound</h2><p>“Where the river bends, the reeds hold.” Your tribe is an alliance of twelve villages sworn to keep the valley free.</p><div class="tribe-stats"><div><b>12</b><small>MEMBERS</small></div><div><b>#08</b><small>RANK</small></div><div><b>6,420</b><small>RENOWN</small></div></div><div class="modal-note">Members online: Kael Reedhand, Mara-of-the-Reeds, Alder Fenwalker, and you.</div>`);
  $('#notifications').onclick = () => { const m = state.marches.length; openModal(`<div class="eyebrow">MESSENGER BIRDS</div><h2>${m ? `${m} dispatch${m > 1 ? 'es' : ''} on the road.` : 'All quiet in the valley.'}</h2><p>${m ? state.marches.map(x => `${x.kind === 'scout' ? 'Scouts' : 'Warband'} returning from ${x.target} in ${Math.max(1, Math.ceil((x.returnAt - Date.now()) / 1000))} seconds.`).join('<br>') : 'Your people have no urgent messages. Check the chronicle for recent news.'}</p><button class="primary-button modal-submit" id="openReports">Read the chronicle</button>`); $('#openReports').onclick = showReports; };
  $('#helpBtn').onclick = () => openModal('<div class="eyebrow">FIELD GUIDE · FIRST STEPS</div><h2>Make your mark on the valley.</h2><p><b>Gather.</b> Timber, stone, and iron trickle in over time, even while you are away.<br><br><b>Build.</b> Upgrade your village through the “Build something” button. Higher production buildings increase your hourly income.<br><br><b>Recruit.</b> Train units in the Barracks, then select an enemy settlement on the map to scout or raid.<br><br><b>Belong.</b> You are one of twelve members of the Reedbound tribe. Allies are marked in green; rivals in rust.<br><br>Your game saves automatically in this browser.</p>');
  drawMap(); drawResources(); tick(); setInterval(tick, 1000);
})();
