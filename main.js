const STRENGTHS = ['Mechanic','Medic','Runner','Marksman','Scavenger'];
const WEAKNESSES = ['Slow Healer','Cowardly','Radiation Sensitive','Heavy Sleeper','Poor Aim'];
const COLORS = [
  'Red','Blue','Green','Yellow','Purple','Orange','Pink','Cyan','Lime','Brown',
  'White','Black','Maroon','Navy','Olive','Teal','Magenta','Gray','Tan','Violet'
];

const client = {
  playerId: localStorage.getItem('rsp_player_id') || '',
  profile: JSON.parse(localStorage.getItem('rsp_profile') || 'null'),
  snapshot: null
};

function byId(id) { return document.getElementById(id); }
function roomById(id) { return client.snapshot.rooms.find(r => r.id === id); }

async function api(path, method = 'GET', body = null) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function setupOverlay() {
  byId('setupStrength').innerHTML = STRENGTHS.map(s => `<option>${s}</option>`).join('');
  byId('setupWeakness').innerHTML = WEAKNESSES.map(w => `<option>${w}</option>`).join('');
  byId('setupColors').value = COLORS.join(', ');

  if (client.profile && client.playerId) {
    byId('setupScreen').style.display = 'none';
    startPolling();
    return;
  }

  byId('startBtn').addEventListener('click', async () => {
    const name = byId('setupName').value.trim();
    const colors = byId('setupColors').value.trim();
    const backstory = byId('setupBackstory').value.trim();
    const strength = byId('setupStrength').value;
    const weakness = byId('setupWeakness').value;

    if (!name || !backstory) return alert('Name and backstory required.');
    if (strength === weakness) return alert('Strength and weakness cannot match.');
    const ranked = colors.split(',').map(x => x.trim()).filter(Boolean);
    if (ranked.length !== 20) return alert('List all 20 colors separated by commas.');

    client.profile = { name, colors, backstory, strength, weakness };
    const joined = await api('/api/join', 'POST', client.profile);
    client.playerId = joined.playerId;

    localStorage.setItem('rsp_profile', JSON.stringify(client.profile));
    localStorage.setItem('rsp_player_id', client.playerId);

    byId('setupScreen').style.display = 'none';
    startPolling();
  });
}

async function fetchState() {
  if (!client.playerId) return;
  client.snapshot = await api(`/api/state?playerId=${encodeURIComponent(client.playerId)}`);
  render();
}

async function sendAction(kind, payload = {}) {
  await api('/api/action', 'POST', { playerId: client.playerId, kind, ...payload });
  await fetchState();
}

function drawHud() {
  const s = client.snapshot;
  const me = s.me;
  byId('hudRound').textContent = s.round;
  byId('hudRole').textContent = s.role;
  byId('hudRoom').textContent = roomById(me.room).name;
  byId('hudPower').textContent = `${s.repairsDone}/${s.repairsNeeded}`;
  byId('hudBloodlust').textContent = Math.floor(me.bloodlust);
  byId('hudInfected').textContent = s.players.concat(s.bots).filter(x => x.alive && x.infectionStage > 0).length;
  byId('hudTime').textContent = `${s.time}s`;
  byId('hudMoney').textContent = Math.floor(me.rubles);
  byId('hudHunger').textContent = Math.floor(me.hunger);
  byId('hudRadiation').textContent = Math.floor(me.radiation);
  byId('hudBleeding').textContent = Math.floor(me.bleeding);
  byId('hudHands').textContent = me.hands.length ? me.hands.join(', ') : 'empty';

  byId('chatLog').innerHTML = s.chat.map(x => `<div>${x}</div>`).join('');
  byId('eventLog').innerHTML = s.events.map(x => `<div>${x}</div>`).join('');
  byId('mutantInfo').textContent = s.mutants.map(m => `${m.name}: ${roomById(m.room).name}`).join(' | ');

  if (s.roundEnded) {
    byId('newRoundBtn').classList.remove('hidden');
  } else {
    byId('newRoundBtn').classList.add('hidden');
  }
}

function drawMap() {
  const s = client.snapshot;
  const me = s.me;
  const map = byId('mapGrid');
  map.innerHTML = '';

  for (const room of s.rooms) {
    const b = document.createElement('button');
    b.className = 'room';
    if (room.id === me.room) b.classList.add('current');
    if (room.id !== me.room && !s.edges[me.room].includes(room.id)) b.classList.add('locked');
    b.innerHTML = `<strong>${room.name}</strong><div class="layer">${room.layer}</div>`;
    b.onclick = () => sendAction('move', { roomId: room.id });
    map.appendChild(b);
  }
}

function drawRoomPanel() {
  const s = client.snapshot;
  const me = s.me;
  const room = roomById(me.room);
  byId('roomTitle').textContent = room.name;
  byId('roomDesc').textContent = `${room.layer} level. Radiation risk ${room.rad}.`;

  const actions = byId('actionButtons');
  actions.innerHTML = '';
  room.actions.forEach((a) => {
    const btn = document.createElement('button');
    btn.textContent = a.toUpperCase();
    if (a === 'vote') btn.classList.add('danger');
    btn.onclick = () => sendAction('roomAction', { action: a });
    actions.appendChild(btn);
  });

  const occ = byId('occupants');
  occ.innerHTML = '';
  const actors = s.players.concat(s.bots).filter(x => x.alive && x.room === me.room);
  actors.forEach((a) => {
    const d = document.createElement('div');
    d.className = 'avatar';
    d.innerHTML = `<div class="sprite" style="background:${a.color.toLowerCase()};"></div>
      ${a.chatBubble ? `<div class="bubble">${a.chatBubble}</div>` : ''}
      <div>${a.name.split(' ')[0]}</div>`;
    occ.appendChild(d);
  });
}

function drawShopAndFiles() {
  const s = client.snapshot;
  const shop = byId('shop');
  shop.innerHTML = '';
  Object.entries(s.shop).forEach(([name, price]) => {
    const btn = document.createElement('button');
    btn.textContent = `${name} (${price})`;
    btn.onclick = () => sendAction('buy', { item: name });
    shop.appendChild(btn);
  });

  const files = byId('crewFiles');
  files.innerHTML = '';
  s.players.concat(s.bots).forEach((p) => {
    const div = document.createElement('div');
    div.className = `file ${p.alive ? '' : 'dead'}`;
    div.innerHTML = `<b style="color:${p.color.toLowerCase()}">${p.name}</b> (${p.type})<br>
      Strength: ${p.strength} | Weakness: ${p.weakness}<br>
      Infection: ${p.infectionStage} | Location: ${roomById(p.room).name}<br>
      ${p.backstory}`;
    files.appendChild(div);
  });
}

function render() {
  if (!client.snapshot) return;
  drawHud();
  drawMap();
  drawRoomPanel();
  drawShopAndFiles();
}

function hookUi() {
  byId('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = byId('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await sendAction('chat', { text });
  });

  byId('newRoundBtn').addEventListener('click', async () => {
    await sendAction('nextRound');
  });
}

function startPolling() {
  hookUi();
  fetchState();
  setInterval(fetchState, 1000);
}

setupOverlay();
