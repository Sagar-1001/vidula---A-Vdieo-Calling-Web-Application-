import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  process.env.CLIENT_URL,
  'https://vidula-a-vdieo-calling-web-application.onrender.com'
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB()
  .then(() => console.log('✅ MongoDB Atlas connected'))
  .catch(err => console.log('❌ MongoDB connection error:', err));

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/meetings', meetingRoutes);

// ============================================================================
// ROOM MANAGEMENT DATA STRUCTURES
// ============================================================================

const rooms = new Map(); // roomId -> Room object
const userSockets = new Map(); // userId -> socket.id
const socketUsers = new Map(); // socket.id -> userId

// Room structure:
// {
//   roomId: string,
//   roomType: 'public' | 'private',
//   creatorId: string,
//   creatorName: string,
//   participants: Map<userId, ParticipantInfo>,
//   waitingRoom: Array<WaitingUser>,
//   deniedUsers: Set<userId>
// }

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createRoom(roomId, creatorId, creatorName, roomType = 'public') {
  const room = {
    roomId,
    roomType,
    creatorId,
    creatorName,
    participants: new Map(),
    waitingRoom: [],
    deniedUsers: new Set()
  };
  rooms.set(roomId, room);
  console.log(`✅ Created ${roomType} room: ${roomId}`);
  return room;
}

function addParticipant(roomId, userId, userName, socketId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  
  const isCreator = room.creatorId === userId;
  
  room.participants.set(userId, {
    userId,
    userName,
    socketId,
    isCreator,
    videoEnabled: true,
    audioEnabled: true,
    isScreenSharing: false,
    joinedAt: Date.now()
  });
  
  userSockets.set(userId, socketId);
  socketUsers.set(socketId, userId);
  
  console.log(`✅ Added ${userName} to room ${roomId} (${room.participants.size} total)`);
  return true;
}

function removeParticipant(socketId) {
  const userId = socketUsers.get(socketId);
  if (!userId) return null;
  
  let roomId = null;
  for (const [rId, room] of rooms.entries()) {
    if (room.participants.has(userId)) {
      roomId = rId;
      room.participants.delete(userId);
      break;
    }
  }
  
  socketUsers.delete(socketId);
  userSockets.delete(userId);
  
  return { userId, roomId };
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function getRoomParticipantsArray(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.participants.values());
}

function cleanupEmptyRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.participants.size === 0) {
    rooms.delete(roomId);
    console.log(`🗑️  Deleted empty room: ${roomId}`);
    return true;
  }
  return false;
}

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  console.log(`\n🔌 Socket connected: ${socket.id}`);
  
  // -------------------------------------------------------------------------
  // REQUEST TO JOIN ROOM
  // -------------------------------------------------------------------------
  socket.on('request-join-room', (roomId, userId, userName) => {
    console.log(`\n📥 JOIN REQUEST: ${userName} (${userId}) → Room ${roomId}`);
    
    const room = getRoom(roomId);
    
    // If room doesn't exist, auto-approve (will be created)
    if (!room) {
      console.log(`  ✅ Room doesn't exist - auto-approving`);
      socket.emit('join-approved', roomId);
      return;
    }
    
    // Check if user was previously denied
    if (room.deniedUsers.has(userId)) {
      console.log(`  ❌ User was previously denied`);
      socket.emit('join-denied', 'You were previously denied access to this room');
      return;
    }
    
    // Public rooms: auto-approve
    if (room.roomType === 'public') {
      console.log(`  ✅ Public room - auto-approving`);
      socket.emit('join-approved', roomId);
      return;
    }
    
    // Private rooms: add to waiting room
    console.log(`  ⏳ Private room - adding to waiting room`);
    
    // Check if already waiting
    const alreadyWaiting = room.waitingRoom.find(u => u.userId === userId);
    if (alreadyWaiting) {
      console.log(`  ⚠️  Already in waiting room`);
      socket.emit('waiting-for-approval', `Waiting for ${room.creatorName} to let you in...`);
      return;
    }
    
    // Add to waiting room
    const waitingUser = {
      userId,
      userName,
      socketId: socket.id,
      requestedAt: Date.now()
    };
    room.waitingRoom.push(waitingUser);
    
    // Notify user they're waiting
    socket.emit('waiting-for-approval', `Waiting for ${room.creatorName} to let you in...`);
    
    // Notify creator
    const creatorSocketId = userSockets.get(room.creatorId);
    if (creatorSocketId) {
      io.to(creatorSocketId).emit('join-request', waitingUser);
      io.to(creatorSocketId).emit('waiting-room-updated', room.waitingRoom);
    }
    
    console.log(`  ✅ Added to waiting room (${room.waitingRoom.length} waiting)`);
  });
  
  // -------------------------------------------------------------------------
  // APPROVE JOIN REQUEST
  // -------------------------------------------------------------------------
  socket.on('approve-join', (roomId, userId) => {
    console.log(`\n✅ APPROVE: ${userId} → Room ${roomId}`);
    
    const room = getRoom(roomId);
    if (!room) {
      console.log(`  ❌ Room not found`);
      return;
    }
    
    const waitingUser = room.waitingRoom.find(u => u.userId === userId);
    if (!waitingUser) {
      console.log(`  ❌ User not in waiting room`);
      return;
    }
    
    // Remove from waiting room
    room.waitingRoom = room.waitingRoom.filter(u => u.userId !== userId);
    
    // Send approval to user
    io.to(waitingUser.socketId).emit('join-approved', roomId);
    
    // Update waiting room list for creator
    const creatorSocketId = userSockets.get(room.creatorId);
    if (creatorSocketId) {
      io.to(creatorSocketId).emit('waiting-room-updated', room.waitingRoom);
    }
    
    console.log(`  ✅ Approved - ${room.waitingRoom.length} still waiting`);
  });
  
  // -------------------------------------------------------------------------
  // DENY JOIN REQUEST
  // -------------------------------------------------------------------------
  socket.on('deny-join', (roomId, userId) => {
    console.log(`\n❌ DENY: ${userId} → Room ${roomId}`);
    
    const room = getRoom(roomId);
    if (!room) return;
    
    const waitingUser = room.waitingRoom.find(u => u.userId === userId);
    if (!waitingUser) return;
    
    // Remove from waiting room and add to denied list
    room.waitingRoom = room.waitingRoom.filter(u => u.userId !== userId);
    room.deniedUsers.add(userId);
    
    // Send denial to user
    io.to(waitingUser.socketId).emit('join-denied', 'The host denied your request to join');
    
    // Update waiting room list for creator
    const creatorSocketId = userSockets.get(room.creatorId);
    if (creatorSocketId) {
      io.to(creatorSocketId).emit('waiting-room-updated', room.waitingRoom);
    }
    
    console.log(`  ✅ Denied - ${room.waitingRoom.length} still waiting`);
  });
  
  // -------------------------------------------------------------------------
  // JOIN ROOM (After Approval)
  // -------------------------------------------------------------------------
  socket.on('join-room', (roomId, userId, userName, roomType = 'public') => {
    console.log(`\n🏠 JOIN ROOM: ${userName} (${userId}) → Room ${roomId}`);
    
    // Join socket.io room
    socket.join(roomId);
    
    // Get or create room
    let room = getRoom(roomId);
    let isNewRoom = false;
    
    if (!room) {
      room = createRoom(roomId, userId, userName, roomType);
      isNewRoom = true;
    }
    
    const isCreator = room.creatorId === userId;
    
    // Add participant to room
    addParticipant(roomId, userId, userName, socket.id);
    
    // Send creator status to joining user
    socket.emit('creator-status', isCreator);
    
    // Get all participants
    const allParticipants = getRoomParticipantsArray(roomId);
    const existingParticipants = allParticipants.filter(p => p.userId !== userId);
    
    console.log(`  👥 Room has ${allParticipants.length} participants`);
    
    // Send all participants to joining user
    socket.emit('all-participants', allParticipants);
    
    // Notify all others about new user
    socket.to(roomId).emit('user-joined', {
      userId,
      userName,
      isCreator,
      videoEnabled: true,
      audioEnabled: true
    });
    
    // CRITICAL: Tell existing users to call the new user
    existingParticipants.forEach(participant => {
      console.log(`  📞 Telling ${participant.userName} to call ${userName}`);
      io.to(participant.socketId).emit('call-user', {
        targetUserId: userId,
        targetUserName: userName
      });
    });
    
    console.log(`  ✅ ${userName} successfully joined room`);
  });
  
  // -------------------------------------------------------------------------
  // GET WAITING ROOM LIST
  // -------------------------------------------------------------------------
  socket.on('get-waiting-room', (roomId) => {
    const room = getRoom(roomId);
    if (room) {
      socket.emit('waiting-room-updated', room.waitingRoom);
    }
  });
  
  // -------------------------------------------------------------------------
  // MEDIA CONTROLS
  // -------------------------------------------------------------------------
  socket.on('toggle-video', (roomId, userId, enabled) => {
    const room = getRoom(roomId);
    if (room && room.participants.has(userId)) {
      const participant = room.participants.get(userId);
      participant.videoEnabled = enabled;
      socket.to(roomId).emit('participant-video-toggle', userId, enabled);
    }
  });
  
  socket.on('toggle-audio', (roomId, userId, enabled) => {
    const room = getRoom(roomId);
    if (room && room.participants.has(userId)) {
      const participant = room.participants.get(userId);
      participant.audioEnabled = enabled;
      socket.to(roomId).emit('participant-audio-toggle', userId, enabled);
    }
  });
  
  socket.on('start-screen-share', (roomId, userId) => {
    const room = getRoom(roomId);
    if (room && room.participants.has(userId)) {
      const participant = room.participants.get(userId);
      participant.isScreenSharing = true;
      socket.to(roomId).emit('participant-screen-share', userId, true);
    }
  });
  
  socket.on('stop-screen-share', (roomId, userId) => {
    const room = getRoom(roomId);
    if (room && room.participants.has(userId)) {
      const participant = room.participants.get(userId);
      participant.isScreenSharing = false;
      socket.to(roomId).emit('participant-screen-share', userId, false);
    }
  });
  
  // -------------------------------------------------------------------------
  // CHAT MESSAGES
  // -------------------------------------------------------------------------
  socket.on('send-message', (roomId, message, userId, userName) => {
    const room = getRoom(roomId);
    if (!room) return;
    
    const isCreator = room.creatorId === userId;
    
    io.to(roomId).emit('receive-message', {
      message,
      userId,
      userName,
      isCreator,
      timestamp: Date.now()
    });
  });
  
  // -------------------------------------------------------------------------
  // DISCONNECT
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`\n🔌 Socket disconnected: ${socket.id}`);
    
    const result = removeParticipant(socket.id);
    
    if (result && result.roomId) {
      const { userId, roomId } = result;
      const room = getRoom(roomId);
      
      console.log(`  👤 User ${userId} left room ${roomId}`);
      
      // Notify others
      socket.to(roomId).emit('user-left', userId);
      
      if (room) {
        // Send updated participant list
        io.to(roomId).emit('all-participants', getRoomParticipantsArray(roomId));
      }
      
      // Cleanup empty room
      cleanupEmptyRoom(roomId);
    }
  });
  
  // -------------------------------------------------------------------------
  // ERROR HANDLING
  // -------------------------------------------------------------------------
  socket.on('error', (error) => {
    console.error(`❌ Socket error on ${socket.id}:`, error);
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Server Status: RUNNING`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS Origins:`, allowedOrigins.length);
  allowedOrigins.forEach(origin => console.log(`   - ${origin}`));
  console.log(`${'='.repeat(60)}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});