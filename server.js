const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ok:true, service:'SHADOW 12'}));

function publicRoom(room) {
  return {
    code: room.code, roomName: room.roomName, isPublic: room.isPublic,
    hostId: room.hostId, hostName: room.hostName, started: room.started,
    players: room.players.map(p => ({
      id:p.id, name:p.name, isBot:p.isBot, ready:p.ready
    }))
  };
}
function listPublicRooms() {
  return [...rooms.values()].filter(r => r.isPublic).map(publicRoom);
}
function broadcastRoom(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
  io.emit('rooms:list', listPublicRooms());
}
function error(socket, message) { socket.emit('error:message', {message}); }
function getPlayer(room, id) { return room.players.find(p => p.id === id); }
function roomFor(socket) {
  for (const room of rooms.values()) if (room.players.some(p => p.id === socket.id)) return room;
  return null;
}
function leave(socket, silent=false) {
  const room = roomFor(socket);
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(room.code);
  if (room.players.length === 0) rooms.delete(room.code);
  else {
    if (room.hostId === socket.id) {
      const next = room.players.find(p => !p.isBot);
      if (next) { room.hostId = next.id; room.hostName = next.name; }
      else { rooms.delete(room.code); if(!silent) socket.emit('room:left'); return; }
    }
    if (room.started && room.players.length < 3) finish(room, 'انتهت الجولة لعدم كفاية اللاعبين.');
    else broadcastRoom(room);
  }
  if (!silent) socket.emit('room:left');
}
function makeCode() {
  let code;
  do { code = Math.random().toString(36).slice(2,8).toUpperCase(); } while (rooms.has(code));
  return code;
}
function assignRoles(room) {
  const roles = ['مافيا','شرطي','محقق','دكتور'];
  while (roles.length < room.players.length) roles.push('مواطن');
  for (let i=roles.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [roles[i],roles[j]]=[roles[j],roles[i]];
  }
  room.players.forEach((p,i)=>{p.role=roles[i];p.votedFor=null;});
}
function finish(room, message) {
  room.started = false;
  room.players.forEach(p=>{p.role=null;p.votedFor=null;if(p.isBot)p.ready=true;});
  io.to(room.code).emit('game:finished',{message});
  broadcastRoom(room);
}
io.on('connection', socket => {
  socket.emit('rooms:list', listPublicRooms());
  socket.on('rooms:list', () => socket.emit('rooms:list', listPublicRooms()));

  socket.on('room:create', data => {
    if (roomFor(socket)) return error(socket,'غادر غرفتك الحالية أولاً.');
    const name = String(data?.name||'').trim().slice(0,18);
    if (!name) return error(socket,'اكتب اسم اللاعب أولاً.');
    const code = makeCode();
    const roomName = String(data.roomName||'غرفة SHADOW').trim().slice(0,24) || 'غرفة SHADOW';
    const room = {
      code, roomName, isPublic:!!data.isPublic, hostId:socket.id, hostName:name,
      started:false, players:[{id:socket.id,name,isBot:false,ready:true,role:null,votedFor:null}]
    };
    rooms.set(code,room);socket.join(code);broadcastRoom(room);
  });

  socket.on('room:join', data => {
    if (roomFor(socket)) return error(socket,'غادر غرفتك الحالية أولاً.');
    const code = String(data?.code||'').trim().toUpperCase();
    const name = String(data?.name||'').trim().slice(0,18);
    const room = rooms.get(code);
    if (!name) return error(socket,'اكتب اسم اللاعب أولاً.');
    if (!room) return error(socket,'الغرفة غير موجودة.');
    if (room.started) return error(socket,'الجولة بدأت بالفعل.');
    if (room.players.length >= 12) return error(socket,'الغرفة مكتملة: 12 لاعباً.');
    if (room.players.some(p=>!p.isBot && p.name.toLowerCase()===name.toLowerCase())) return error(socket,'هذا الاسم مستخدم في الغرفة.');
    room.players.push({id:socket.id,name,isBot:false,ready:false,role:null,votedFor:null});
    socket.join(code);broadcastRoom(room);
  });

  socket.on('room:ready', () => {
    const room=roomFor(socket);if(!room)return;
    if(room.started)return error(socket,'الجولة بدأت بالفعل.');
    const p=getPlayer(room,socket.id);if(!p)return;
    p.ready=!p.ready;broadcastRoom(room);
  });

  socket.on('room:addBot', () => {
    const room=roomFor(socket);if(!room)return error(socket,'ادخل غرفة أولاً.');
    if(room.started)return error(socket,'لا يمكن إضافة بوت أثناء الجولة.');
    if(room.hostId!==socket.id)return error(socket,'فقط الأونر يقدر يضيف بوتات.');
    if(room.players.length>=12)return error(socket,'الغرفة مكتملة: 12 مشاركاً.');
    const n=room.players.filter(p=>p.isBot).length+1;
    room.players.push({id:`bot-${room.code}-${n}-${Date.now()}`,name:`BOT_${n}`,isBot:true,ready:true,role:null,votedFor:null});
    broadcastRoom(room);
  });

  socket.on('room:removeBot', () => {
    const room=roomFor(socket);if(!room)return error(socket,'ادخل غرفة أولاً.');
    if(room.started)return error(socket,'لا يمكن حذف بوت أثناء الجولة.');
    if(room.hostId!==socket.id)return error(socket,'فقط الأونر يقدر يحذف بوتات.');
    const i=room.players.findLastIndex(p=>p.isBot);
    if(i<0)return error(socket,'ما فيه بوتات للحذف.');
    room.players.splice(i,1);broadcastRoom(room);
  });

  socket.on('game:start', () => {
    const room=roomFor(socket);if(!room)return;
    if(room.hostId!==socket.id)return error(socket,'فقط الأونر يقدر يبدأ الجولة.');
    if(room.started)return error(socket,'الجولة بدأت بالفعل.');
    if(room.players.length<5)return error(socket,'تحتاج 5 مشاركين على الأقل. أضف بوتات للتجربة.');
    if(!room.players.every(p=>p.ready))return error(socket,'لازم كل اللاعبين الحقيقيين يكونون جاهزين.');
    room.started=true;assignRoles(room);
    room.players.filter(p=>!p.isBot).forEach(p=>io.to(p.id).emit('game:role',{role:p.role}));
    broadcastRoom(room);
    io.to(room.code).emit('game:message',{message:'بدأت الجولة! احتفظ بدورك سراً.'});
  });

  socket.on('game:vote', data => {
    const room=roomFor(socket);if(!room||!room.started)return;
    const voter=getPlayer(room,socket.id);
    const target=room.players.find(p=>p.id===data?.targetId);
    if(!voter||!target||target.id===voter.id)return error(socket,'تصويت غير صالح.');
    voter.votedFor=target.id;
    io.to(room.code).emit('game:message',{message:`تم تسجيل تصويت من ${voter.name}.`});
    if(room.players.filter(p=>!p.isBot).every(p=>p.votedFor)) {
      const counts={};
      room.players.forEach(p=>{if(p.votedFor)counts[p.votedFor]=(counts[p.votedFor]||0)+1;});
      const winner=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
      const eliminated=winner&&room.players.find(p=>p.id===winner[0]);
      if(eliminated) io.to(room.code).emit('game:message',{message:`انتهى التصويت. أعلى الأصوات: ${eliminated.name}.`});
    }
  });

  socket.on('game:finish', () => {
    const room=roomFor(socket);if(!room||!room.started)return;
    if(room.hostId!==socket.id)return error(socket,'فقط الأونر يقدر ينهي الجولة.');
    finish(room,'انتهت الجولة. تمت إضافة مكافأة تجريبية للاعبين المتصلين.');
  });

  socket.on('room:leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket,true));
});
server.listen(PORT, () => console.log(`SHADOW 12 server running on port ${PORT}`));
