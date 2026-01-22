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
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

connectDB()
  .then(() => console.log('MongoDB Atlas connected successfully'))
  .catch(err => console.log('MongoDB connection error:', err));

app.use('/api/users', userRoutes);
app.use('/api/meetings', meetingRoutes);

// Room management
const rooms = {};
const roomCreators = {};
const userToRoom = {}; // Track which room each user is in

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // JOIN ROOM - Main entry point
  socket.on('join-room', (roomId, userId, userName) => {
    console.log(`User ${userName} (${userId}) joining room ${roomId}`);
    
    // Join the socket.io room
    socket.join(roomId);
    
    // Track user's room
    userToRoom[userId] = roomId;
    
    // Determine if user is creator
    let isCreator = false;
    if (!rooms[roomId]) {
      // First person creates the room
      rooms[roomId] = { participants: {} };
      roomCreators[roomId] = userId;
      isCreator = true;
      console.log(`✓ User ${userName} (${userId}) CREATED room ${roomId}`);
    } else {
      // Check if returning creator
      isCreator = roomCreators[roomId] === userId;
      console.log(`✓ User ${userName} (${userId}) JOINED room ${roomId}`);
    }
    
    // Add participant to room
    rooms[roomId].participants[userId] = {
      id: userId,
      name: userName,
      socketId: socket.id,
      isCreator: isCreator,
      videoEnabled: true,
      audioEnabled: true,
      isScreenSharing: false
    };
    
    // Tell the user if they're the creator
    socket.emit('room-creator-status', isCreator);
    
    // Notify OTHER users in the room about new user
    socket.to(roomId).emit('user-connected', userId, userName);
    
    // Send current participants to the joining user
    socket.emit('room-participants', rooms[roomId].participants);
    
    // Update all users about participant list
    io.to(roomId).emit('room-participants-updated', rooms[roomId].participants);
    
    // If this is a participant joining, notify the creator specifically
    if (!isCreator && roomCreators[roomId]) {
      const creatorId = roomCreators[roomId];
      const creatorSocketId = rooms[roomId].participants[creatorId]?.socketId;
      
      if (creatorSocketId) {
        console.log(`→ Notifying creator ${creatorId} about participant ${userId}`);
        io.to(creatorSocketId).emit('participant-joined', userId, userName);
        // Also tell creator to connect
        io.to(creatorSocketId).emit('connect-to-participant', userId, userName);
      }
    }
    
    console.log(`Room ${roomId} now has ${Object.keys(rooms[roomId].participants).length} participants`);
  });

  // CHECK CREATOR STATUS (separate event)
  socket.on('check-creator-status', (roomId, userId) => {
    const isCreator = roomCreators[roomId] === userId;
    console.log(`Checking creator status for ${userId} in room ${roomId}: ${isCreator}`);
    socket.emit('room-creator-status', isCreator);
  });

  // REQUEST CREATOR CONNECTION
  socket.on('request-creator-connection', (roomId, userId, userName) => {
    console.log(`User ${userName} (${userId}) requesting connection to creator`);
    
    if (rooms[roomId] && roomCreators[roomId]) {
      const creatorId = roomCreators[roomId];
      const creatorSocketId = rooms[roomId].participants[creatorId]?.socketId;
      
      if (creatorSocketId) {
        console.log(`→ Telling creator ${creatorId} to connect to ${userId}`);
        io.to(creatorSocketId).emit('connect-to-participant', userId, userName);
      }
    }
  });

  // SEND MESSAGE
  socket.on('send-message', (roomId, message, userId, userName, isFromCreator) => {
    console.log(`Message from ${userName} in room ${roomId}: ${message}`);
    
    // Broadcast to everyone in the room (including sender for confirmation)
    io.to(roomId).emit('receive-message', message, userId, userName, isFromCreator);
    
    // Save to database
    try {
      import('./models/meeting-model.js').then(({ default: Meeting }) => {
        Meeting.findOne({ meetingId: roomId })
          .then(meeting => {
            if (meeting) {
              meeting.messages.push({
                sender: userId,
                senderName: userName,
                content: message,
                isFromCreator: isFromCreator
              });
              meeting.save();
            }
          })
          .catch(err => console.error("Error saving message:", err));
      }).catch(err => console.error("Error importing Meeting model:", err));
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  // MESSAGE HISTORY
  socket.on('message-history', (roomId, targetUserId, messages) => {
    io.to(targetUserId).emit('message-history', messages);
  });

  // TOGGLE VIDEO
  socket.on('toggle-video', (roomId, userId, videoEnabled) => {
    if (rooms[roomId]?.participants[userId]) {
      rooms[roomId].participants[userId].videoEnabled = videoEnabled;
    }
    socket.to(roomId).emit('user-toggle-video', userId, videoEnabled);
  });

  // TOGGLE AUDIO
  socket.on('toggle-audio', (roomId, userId, audioEnabled) => {
    if (rooms[roomId]?.participants[userId]) {
      rooms[roomId].participants[userId].audioEnabled = audioEnabled;
    }
    socket.to(roomId).emit('user-toggle-audio', userId, audioEnabled);
  });

  // SCREEN SHARE
  socket.on('start-screen-share', (roomId, userId) => {
    if (rooms[roomId]?.participants[userId]) {
      rooms[roomId].participants[userId].isScreenSharing = true;
    }
    socket.to(roomId).emit('user-screen-share', userId, true);
  });

  socket.on('stop-screen-share', (roomId, userId) => {
    if (rooms[roomId]?.participants[userId]) {
      rooms[roomId].participants[userId].isScreenSharing = false;
    }
    socket.to(roomId).emit('user-screen-share', userId, false);
  });

  // WEBRTC SIGNALING
  socket.on('signal', (toId, message) => {
    io.to(toId).emit('signal', socket.id, message);
  });

  // DISCONNECT - Single handler for all disconnects
  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
    
    // Find which user and room this socket belongs to
    let disconnectedUserId = null;
    let disconnectedRoomId = null;
    
    // Search through all rooms to find this socket
    for (const [roomId, room] of Object.entries(rooms)) {
      for (const [userId, participant] of Object.entries(room.participants)) {
        if (participant.socketId === socket.id) {
          disconnectedUserId = userId;
          disconnectedRoomId = roomId;
          break;
        }
      }
      if (disconnectedUserId) break;
    }
    
    if (disconnectedUserId && disconnectedRoomId) {
      const userName = rooms[disconnectedRoomId].participants[disconnectedUserId]?.name;
      console.log(`User ${userName} (${disconnectedUserId}) left room ${disconnectedRoomId}`);
      
      // Remove from room
      delete rooms[disconnectedRoomId].participants[disconnectedUserId];
      delete userToRoom[disconnectedUserId];
      
      // Notify others
      io.to(disconnectedRoomId).emit('user-disconnected', disconnectedUserId);
      io.to(disconnectedRoomId).emit('room-participants-updated', rooms[disconnectedRoomId].participants);
      
      // Clean up empty room
      if (Object.keys(rooms[disconnectedRoomId].participants).length === 0) {
        console.log(`Room ${disconnectedRoomId} is empty, removing...`);
        delete rooms[disconnectedRoomId];
        delete roomCreators[disconnectedRoomId];
      }
    }
  });
});

// Production setup
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});