const http = require('http');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

const COLORS = [
  'Red','Blue','Green','Yellow','Purple','Orange','Pink','Cyan','Lime','Brown',
  'White','Black','Maroon','Navy','Olive','Teal','Magenta','Gray','Tan','Violet'
];
const NAMES = ['Yuri','Nikolai','Sasha','Irina','Mikhail','Anya','Viktor','Lev','Galina','Oleg'];
const STRENGTHS = ['Mechanic','Medic','Runner','Marksman','Scavenger'];
const WEAKNESSES = ['Slow Healer','Cowardly','Radiation Sensitive','Heavy Sleeper','Poor Aim'];
const KILL_TYPES = ['Garrote Wire', 'Boiler Push', 'Neck Snap', 'Acid Flask', 'Pipe Through Chest', 'Scalpel Burst', 'Revolver Execution', 'Electrical Arc', 'Vent Drag', 'Hammer Skull'];
const SHOP_ITEMS = { Axe:18, Flashlight:10, Revolver:25, Ration:8, Bandage:9, Iodine:12 };

const ROOMS = [
  { id:'b_water', name:'Water Treatment', layer:'Basement', rad:2, actions:['search','repair','infect'] },
  { id:'b_reactor', name:'Reactor Access', layer:'Basement', rad:4, actions:['repair'] },
  { id:'b_tunnel', name:'Service Tunnels', layer:'Basement', rad:1, actions:['search'] },
  { id:'m_line_a', name:'Production Line A', layer:'Main', rad:1, actions:['search'] },
  { id:'m_line_b', name:'Production Line B', layer:'Main', rad:1, actions:['search'] },
  { id:'m_loading', name:'Loading Bay', layer:'Main', rad:1, actions:['search','sell'] },
  { id:'m_switch', name:'Switchgear Hall', layer:'Main', rad:2, actions:['repair'] },
  { id:'u_control', name:'Command Room', layer:'Upper', rad:1, actions:['repair','escape'] },
  { id:'u_office', name:'Records Office', layer:'Upper', rad:0, actions:['files'] },
  { id:'u_meeting', name:'Meeting Room', layer:'Upper', rad:0, actions:['vote'] },
  { id:'u_barracks', name:'Barracks', layer:'Upper', rad:0, actions:['eat','treat'] },
  { id:'u_catwalk', name:'Catwalks', layer:'Upper', rad:2, actions:['search'] }
];
const EDGES = {
  b_water:['b_tunnel','b_reactor'], b_reactor:['b_water','b_tunnel','m_switch'], b_tunnel:['b_water','b_reactor','m_loading'],
  m_line_a:['m_line_b','m_switch'], m_line_b:['m_line_a','m_loading','u_catwalk'], m_loading:['m_line_b','m_switch','b_tunnel','u_barracks'],
  m_switch:['m_loading','m_line_a','b_reactor','u_control'], u_control:['u_office','u_meeting','m_switch'], u_office:['u_control','u_meeting'],
  u_meeting:['u_control','u_office','u_catwalk'], u_barracks:['u_catwalk','m_loading'], u_catwalk:['u_meeting','u_barracks','m_line_b']
};

const state = {
  round: 1,
  roundEnded: false,
  winner: '',
  time: 900,
  repairsNeeded: 5,
  repairsDone: 0,
  impostorId: null,
  bots: [],
  players: new Map(),
  mutants: [
    { name:'Brute Mutant', room:'m_line_a', dmg:10 },
    { name:'Leech Mutant', room:'b_tunnel', dmg:7 },
    { name:'Mimic Mutant', room:'u_catwalk', dmg:6 }
  ],
  chat: [],
  events: []
};

function r(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function roomById(id){ return ROOMS.find(x => x.id === id); }
function aliveHumans(){ return [...state.players.values()].filter(p => p.alive); }
function everyoneAlive(){ return [...state.players.values(), ...state.bots].filter(p => p.alive); }
function logEvent(line){ state.events.push(line); if (state.events.length > 140) state.events.shift(); }
function logChat(line){ state.chat.push(line); if (state.chat.length > 80) state.chat.shift(); }

function createBots() {
  state.bots = [];
  for (let i = 0; i < 20; i += 1) {
    state.bots.push({
      id: `bot_${i}`,
      type: 'bot',
      name: `${r(NAMES)}-${i + 1}`,
      color: COLORS[i],
      strength: r(STRENGTHS),
      weakness: r(WEAKNESSES),
      backstory: `Factory transfer ${1970 + (i % 10)}.`,
      room: r(ROOMS).id,
      alive: true,
      infectionStage: 0,
      bloodlust: 100,
      rubles: 0,
      hunger: 100,
      radiation: 0,
      bleeding: 0,
      hands: [],
      chatBubble: ''
    });
  }
  state.impostorId = r(state.bots).id;
  const imp = state.bots.find(b => b.id === state.impostorId);
  if (imp) imp.infectionStage = 3;
}

function resetRound() {
  state.roundEnded = false;
  state.winner = '';
  state.time = 900;
  state.repairsDone = 0;
  state.repairsNeeded = 5;
  state.chat = [];
  state.events = [];
  createBots();

  for (const p of state.players.values()) {
    p.room = 'm_loading';
    p.alive = true;
    p.hunger = 100;
    p.radiation = 0;
    p.bleeding = 0;
    p.infectionStage = 0;
    p.scrap = 0;
    p.bloodlust = 100;
    p.chatBubble = '';
    if (Math.random() < 0.14) state.impostorId = p.id;
  }
  const pImp = state.players.get(state.impostorId);
  if (pImp) pImp.infectionStage = 3;

  state.mutants = [
    { name:'Brute Mutant', room:'m_line_a', dmg:10 },
    { name:'Leech Mutant', room:'b_tunnel', dmg:7 },
    { name:'Mimic Mutant', room:'u_catwalk', dmg:6 }
  ];
  logEvent(`Round ${state.round} started. Restore power and escape.`);
}

function joinPlayer(profile) {
  const id = randomUUID();
  const player = {
    id,
    type: 'human',
    name: profile.name,
    color: profile.colors?.split(',')[0]?.trim() || r(COLORS),
    strength: profile.strength,
    weakness: profile.weakness,
    backstory: profile.backstory,
    room: 'm_loading',
    alive: true,
    infectionStage: 0,
    bloodlust: 100,
    rubles: 25,
    scrap: 0,
    hunger: 100,
    radiation: 0,
    bleeding: 0,
    hands: [],
    chatBubble: '',
    colors: profile.colors || ''
  };
  state.players.set(id, player);
  logEvent(`${player.name} joined the mission.`);
  return player;
}

function actorById(id) {
  return state.players.get(id) || state.bots.find(b => b.id === id);
}

function move(player, roomId) {
  if (state.roundEnded || !player.alive) return;
  if (roomId !== player.room && !EDGES[player.room].includes(roomId)) return;
  player.room = roomId;
}

function pickItem(player, item) {
  if (player.hands.length >= 2) return false;
  player.hands.push(item);
  return true;
}

function doAction(player, action) {
  if (state.roundEnded || !player.alive) return;

  if (action === 'search') {
    const roll = Math.random();
    if (roll < 0.4) player.scrap += (7 + Math.floor(Math.random() * 14));
    else if (roll < 0.8) pickItem(player, r(Object.keys(SHOP_ITEMS)));
    else player.bleeding += 6;
  }

  if (action === 'sell') {
    player.rubles += player.scrap;
    player.scrap = 0;
  }

  if (action === 'repair') {
    let chance = 0.44;
    if (player.strength === 'Mechanic') chance += 0.2;
    if (player.hands.includes('Flashlight')) chance += 0.1;
    if (Math.random() < chance) state.repairsDone += 1;
    else player.radiation += 5;
  }

  if (action === 'infect' && player.id === state.impostorId) {
    const victims = everyoneAlive().filter(x => x.id !== player.id && x.room === player.room);
    if (victims.length) {
      const v = r(victims);
      v.infectionStage = Math.min(3, v.infectionStage + 1);
      player.bloodlust = Math.min(100, player.bloodlust + 15);
    }
  }

  if (action === 'eat') {
    const i = player.hands.indexOf('Ration');
    if (i >= 0) {
      player.hands.splice(i, 1);
      player.hunger = Math.min(100, player.hunger + 30);
    }
  }

  if (action === 'treat') {
    if (player.hands.includes('Bandage')) player.bleeding = Math.max(0, player.bleeding - 24);
    if (player.hands.includes('Iodine')) player.radiation = Math.max(0, player.radiation - 20);
  }

  if (action === 'vote') {
    const candidates = everyoneAlive().filter(x => x.infectionStage > 1 || x.id === state.impostorId);
    if (candidates.length > 2) {
      const out = r(candidates);
      out.alive = false;
      logEvent(`${out.name} ejected into acid.`);
      if (out.id === state.impostorId) endRound('Crew');
    }
  }

  if (action === 'escape' && state.repairsDone >= state.repairsNeeded) {
    endRound('Crew');
  }
}

function buy(player, item) {
  const price = SHOP_ITEMS[item];
  if (!price || player.rubles < price) return;
  if (!pickItem(player, item)) return;
  player.rubles -= price;
}

function nearestVictim(impostor) {
  const near = everyoneAlive().filter(x => x.id !== impostor.id && x.room === impostor.room);
  if (near.length) return near[0];
  return everyoneAlive().find(x => x.id !== impostor.id) || null;
}

function endRound(side) {
  if (state.roundEnded) return;
  state.roundEnded = true;
  state.winner = side;
  logEvent(`Round ended. Winner: ${side}.`);
}

function botTick() {
  for (const b of state.bots) {
    if (!b.alive) continue;
    if (Math.random() < 0.5) b.room = r(EDGES[b.room]);
    if (Math.random() < 0.1) b.chatBubble = r(['Need light.', 'Stay close.', 'Check files.', 'Something moved.']);

    if (b.id === state.impostorId) {
      b.bloodlust -= 4;
      const canKill = Math.random() < 0.2 || b.bloodlust <= 0;
      if (canKill) {
        const victim = b.bloodlust <= 0 ? nearestVictim(b) : r(everyoneAlive().filter(x => x.id !== b.id && x.room === b.room));
        if (victim) {
          victim.alive = false;
          b.bloodlust = 100;
          logEvent(`${victim.name} killed (${r(KILL_TYPES)}).`);
        }
      }
    }
  }
}

function mutantTick() {
  for (const m of state.mutants) {
    if (Math.random() < 0.6) m.room = r(EDGES[m.room]);
    const targets = everyoneAlive().filter(x => x.room === m.room);
    if (targets.length && Math.random() < 0.18) {
      const t = r(targets);
      t.bleeding += m.dmg;
      t.infectionStage = Math.max(1, t.infectionStage);
      logEvent(`${m.name} attacked ${t.name}.`);
    }
  }
}

function survivalTick() {
  state.time -= 1;
  for (const p of everyoneAlive()) {
    const rm = roomById(p.room);
    p.hunger = Math.max(0, p.hunger - 0.85);
    p.radiation = Math.min(100, p.radiation + rm.rad * 0.35);
    p.bleeding = Math.min(100, p.bleeding + 0.3);
    if (p.weakness === 'Radiation Sensitive') p.radiation = Math.min(100, p.radiation + 0.2);

    if (p.hunger <= 0 || p.radiation >= 100 || p.bleeding >= 100) {
      p.alive = false;
      p.rubles = Math.max(0, p.rubles - 20);
      if (p.type === 'human') p.hands = [];
    }
  }

  const imp = actorById(state.impostorId);
  const impAlive = imp && imp.alive;
  const crewAlive = everyoneAlive().some(x => x.id !== state.impostorId);

  if (!impAlive) endRound('Crew');
  else if (!crewAlive) endRound('Impostor');
  else if (state.time <= 0) endRound('None');
}

function tick() {
  if (state.players.size === 0) return;
  if (state.roundEnded) return;
  botTick();
  mutantTick();
  survivalTick();
}

function playerSnapshot(player) {
  const role = player.id === state.impostorId ? 'Impostor' : 'Crew';
  return {
    me: player,
    role,
    round: state.round,
    roundEnded: state.roundEnded,
    winner: state.winner,
    time: state.time,
    repairsNeeded: state.repairsNeeded,
    repairsDone: state.repairsDone,
    rooms: ROOMS,
    edges: EDGES,
    shop: SHOP_ITEMS,
    players: [...state.players.values()],
    bots: state.bots,
    mutants: state.mutants,
    chat: state.chat,
    events: state.events
  };
}

function send(res, code, payload, ctype='application/json') {
  res.writeHead(code, { 'Content-Type': ctype });
  res.end(ctype === 'application/json' ? JSON.stringify(payload) : payload);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/join') {
    const body = await parseBody(req);
    if (!body.name || !body.backstory || !body.strength || !body.weakness) return send(res, 400, { error: 'Invalid profile' });
    const player = joinPlayer(body);
    if (state.players.size === 1) resetRound();
    return send(res, 200, { playerId: player.id });
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const id = url.searchParams.get('playerId');
    const player = state.players.get(id);
    if (!player) return send(res, 404, { error: 'Unknown player' });
    return send(res, 200, playerSnapshot(player));
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    const body = await parseBody(req);
    const player = state.players.get(body.playerId);
    if (!player) return send(res, 404, { error: 'Unknown player' });
    if (body.kind === 'move') move(player, body.roomId);
    if (body.kind === 'roomAction') doAction(player, body.action);
    if (body.kind === 'buy') buy(player, body.item);
    if (body.kind === 'chat' && body.text) {
      logChat(`${player.name}: ${String(body.text).slice(0, 120)}`);
      player.chatBubble = String(body.text).slice(0, 40);
    }
    if (body.kind === 'nextRound' && state.roundEnded) {
      state.round += 1;
      resetRound();
    }
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(process.cwd(), filePath.replace(/^\//, ''));
    const ext = path.extname(fullPath);
    if (!mimeByExt[ext]) return send(res, 404, 'Not found', 'text/plain');
    if (!fs.existsSync(fullPath)) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, fs.readFileSync(fullPath, 'utf8'), mimeByExt[ext]);
  }

  return send(res, 404, { error: 'Not found' });
});

setInterval(tick, 1000);
server.listen(PORT, () => {
  console.log(`Red Shift Protocol server running on http://localhost:${PORT}`);
});
