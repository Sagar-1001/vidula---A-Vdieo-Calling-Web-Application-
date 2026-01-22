import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import Controls from './Controls';
import VideoGrid from './VideoGrid';
import Participants from './Participants';

const Room = ({ userName, onRoomEnter, onRoomExit }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [actualUserName, setActualUserName] = useState(userName || `Guest-${Math.floor(Math.random() * 10000)}`);
  
  useEffect(() => {
    if (!userName) {
      setActualUserName(`Guest-${Math.floor(Math.random() * 10000)}`);
    }
  }, [userName]);
  
  const [peers, setPeers] = useState({});
  const [participants, setParticipants] = useState({});
  const [messages, setMessages] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [myStream, setMyStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  
  const socketRef = useRef();
  const myVideoRef = useRef();
  const myPeerRef = useRef();
  const myPeerId = useRef('');
  const hasJoinedRoom = useRef(false); // ✅ NEW: Prevent duplicate joins
  const connectedPeers = useRef(new Set()); // ✅ NEW: Track who we've connected to
  
  useEffect(() => {
    if (onRoomEnter) onRoomEnter();
    return () => {
      if (onRoomExit) onRoomExit();
    };
  }, [onRoomEnter, onRoomExit]);
  
  useEffect(() => {
    // ✅ Prevent duplicate execution in React Strict Mode
    if (hasJoinedRoom.current) return;
    hasJoinedRoom.current = true;
    
   const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

  socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      setMyStream(stream);
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
      }
      
      const peer = new Peer(undefined, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });
      
      myPeerRef.current = peer;
      
      peer.on('open', (id) => {
        myPeerId.current = id;
        console.log("✓ My peer ID:", id);
        
        // Join room
        socketRef.current.emit('join-room', roomId, id, actualUserName);
      });
      
      // Handle incoming calls
      peer.on('call', (call) => {
        console.log(`← Receiving call from: ${call.peer}`);
        
        // ✅ FIX: Don't answer calls from yourself!
        if (call.peer === myPeerId.current) {
          console.log('⚠️ Ignoring call from self');
          return;
        }
        
        call.answer(stream);
        
        call.on('stream', (remoteStream) => {
          console.log(`✓ Received stream from: ${call.peer}`);
          
          // ✅ FIX: Don't add yourself to peers
          if (call.peer !== myPeerId.current) {
            setPeers(prevPeers => ({
              ...prevPeers,
              [call.peer]: remoteStream
            }));
          }
        });
        
        call.on('close', () => {
          console.log(`✗ Call closed with: ${call.peer}`);
          setPeers(prevPeers => {
            const newPeers = { ...prevPeers };
            delete newPeers[call.peer];
            return newPeers;
          });
          connectedPeers.current.delete(call.peer);
        });
        
        call.on('error', (err) => {
          console.error(`Call error:`, err);
          connectedPeers.current.delete(call.peer);
        });
      });
      
      // ✅ FIXED: Connection logic with self-check
      const connectToUser = (userId, stream, attempt = 1) => {
        // ✅ CRITICAL: Don't connect to yourself!
        if (userId === myPeerId.current) {
          console.log('⚠️ Skipping connection to self');
          return;
        }
        
        // ✅ Don't connect if already connected
        if (connectedPeers.current.has(userId)) {
          console.log(`⚠️ Already connected to ${userId}`);
          return;
        }
        
        if (attempt > 3) {
          console.error(`Failed to connect to ${userId} after 3 attempts`);
          return;
        }
        
        console.log(`→ Connecting to ${userId} (attempt ${attempt})`);
        
        try {
          const call = myPeerRef.current.call(userId, stream);
          
          if (!call) {
            console.log(`Call failed, retrying in ${attempt}s...`);
            setTimeout(() => connectToUser(userId, stream, attempt + 1), attempt * 1000);
            return;
          }
          
          console.log(`✓ Call created to ${userId}`);
          connectedPeers.current.add(userId); // Mark as connected
          
          call.on('stream', (remoteStream) => {
            console.log(`✓ Received stream from ${userId}`);
            
            // ✅ FIX: Double-check not adding self
            if (userId !== myPeerId.current) {
              setPeers(prevPeers => ({
                ...prevPeers,
                [userId]: remoteStream
              }));
            }
          });
          
          call.on('close', () => {
            console.log(`✗ Call closed with ${userId}`);
            setPeers(prevPeers => {
              const newPeers = { ...prevPeers };
              delete newPeers[userId];
              return newPeers;
            });
            connectedPeers.current.delete(userId);
          });
          
          call.on('error', (err) => {
            console.error(`Call error with ${userId}:`, err);
            connectedPeers.current.delete(userId);
            setTimeout(() => connectToUser(userId, stream, attempt + 1), attempt * 1000);
          });
          
        } catch (err) {
          console.error(`Error calling ${userId}:`, err);
          connectedPeers.current.delete(userId);
          setTimeout(() => connectToUser(userId, stream, attempt + 1), attempt * 1000);
        }
      };
      
      // Socket event handlers
      socketRef.current.on('room-creator-status', (isCreator) => {
        console.log("✓ Server says I am creator:", isCreator);
        setIsRoomCreator(Boolean(isCreator));
      });
      
      socketRef.current.on('user-connected', (userId, userName) => {
        console.log(`✓ User connected: ${userName} (${userId})`);
        
        // ✅ FIX: Don't connect to yourself
        if (userId === myPeerId.current) {
          console.log('⚠️ Ignoring user-connected event for self');
          return;
        }
        
        if (stream && myPeerRef.current) {
          connectToUser(userId, stream);
        }
      });
      
      socketRef.current.on('participant-joined', (userId, userName) => {
        console.log(`✓ Participant joined: ${userName} (${userId})`);
        
        // ✅ FIX: Don't connect to yourself
        if (userId === myPeerId.current) {
          console.log('⚠️ Ignoring participant-joined event for self');
          return;
        }
        
        if (stream && myPeerRef.current) {
          connectToUser(userId, stream);
        }
      });
      
      socketRef.current.on('connect-to-participant', (userId, userName) => {
        console.log(`✓ Connecting to participant: ${userName} (${userId})`);
        
        // ✅ FIX: Don't connect to yourself
        if (userId === myPeerId.current) {
          console.log('⚠️ Ignoring connect-to-participant event for self');
          return;
        }
        
        if (stream && myPeerRef.current) {
          connectToUser(userId, stream);
        }
      });
      
      socketRef.current.on('user-disconnected', (userId) => {
        console.log(`✗ User disconnected: ${userId}`);
        
        setPeers(prevPeers => {
          const newPeers = { ...prevPeers };
          delete newPeers[userId];
          return newPeers;
        });
        
        setParticipants(prevParticipants => {
          const newParticipants = { ...prevParticipants };
          delete newParticipants[userId];
          return newParticipants;
        });
        
        connectedPeers.current.delete(userId);
      });
      
      socketRef.current.on('room-participants', (roomParticipants) => {
        console.log('📋 Room participants:', roomParticipants);
        setParticipants(roomParticipants);
      });
      
      socketRef.current.on('room-participants-updated', (roomParticipants) => {
        console.log('📋 Participants updated:', roomParticipants);
        setParticipants(roomParticipants);
      });
      
      socketRef.current.on('receive-message', (message, userId, userName, isFromCreator) => {
        console.log(`Message from ${userName}: ${message}`);
        
        setMessages(prevMessages => {
          const isDuplicate = prevMessages.some(msg => 
            msg.userId === userId && 
            msg.message === message && 
            (new Date().getTime() - new Date(msg.timestamp).getTime() < 2000)
          );
          
          if (isDuplicate) {
            return prevMessages;
          }
          
          return [
            ...prevMessages,
            {
              id: Date.now() + Math.random(),
              message,
              userId,
              userName,
              timestamp: new Date().toISOString(),
              isFromCreator
            }
          ];
        });
      });
      
      socketRef.current.on('user-toggle-video', (userId, videoEnabled) => {
        setParticipants(prevParticipants => ({
          ...prevParticipants,
          [userId]: {
            ...prevParticipants[userId],
            videoEnabled
          }
        }));
      });
      
      socketRef.current.on('user-toggle-audio', (userId, audioEnabled) => {
        setParticipants(prevParticipants => ({
          ...prevParticipants,
          [userId]: {
            ...prevParticipants[userId],
            audioEnabled
          }
        }));
      });
      
      socketRef.current.on('user-screen-share', (userId, isSharing) => {
        setParticipants(prevParticipants => ({
          ...prevParticipants,
          [userId]: {
            ...prevParticipants[userId],
            isScreenSharing: isSharing
          }
        }));
      });
      
    }).catch(error => {
      console.error('Error accessing media devices:', error);
      alert('Failed to access camera/microphone. Please check permissions.');
    });
    
    // Cleanup
    return () => {
      if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      if (myPeerRef.current) {
        myPeerRef.current.destroy();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      hasJoinedRoom.current = false;
      connectedPeers.current.clear();
    };
  }, [roomId, actualUserName, navigate]);
  
  const toggleAudio = () => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        socketRef.current.emit('toggle-audio', roomId, myPeerId.current, audioTrack.enabled);
      }
    }
  };
  
  const toggleVideo = () => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        socketRef.current.emit('toggle-video', roomId, myPeerId.current, videoTrack.enabled);
      }
    }
  };
  
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
        
        setScreenStream(stream);
        const videoTrack = stream.getVideoTracks()[0];
        
        const senders = myPeerRef.current.connections;
        Object.values(senders).forEach(sender => {
          sender.forEach(s => {
            s.peerConnection.getSenders().forEach(rtpSender => {
              if (rtpSender.track && rtpSender.track.kind === 'video') {
                rtpSender.replaceTrack(videoTrack);
              }
            });
          });
        });
        
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream;
        }
        
        setIsScreenSharing(true);
        socketRef.current.emit('start-screen-share', roomId, myPeerId.current);
        
        videoTrack.onended = () => {
          stopScreenShare();
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      stopScreenShare();
    }
  };
  
  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      const senders = myPeerRef.current.connections;
      
      Object.values(senders).forEach(sender => {
        sender.forEach(s => {
          s.peerConnection.getSenders().forEach(rtpSender => {
            if (rtpSender.track && rtpSender.track.kind === 'video') {
              rtpSender.replaceTrack(videoTrack);
            }
          });
        });
      });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = myStream;
      }
    }
    
    setIsScreenSharing(false);
    socketRef.current.emit('stop-screen-share', roomId, myPeerId.current);
  };
  
  const sendMessage = (message) => {
    if (message.trim() && socketRef.current) {
      console.log("Sending message:", message);
      socketRef.current.emit('send-message', roomId, message, myPeerId.current, actualUserName, isRoomCreator);
    }
  };
  
  const leaveMeeting = () => {
    if (myStream) {
      myStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (myPeerRef.current) {
      myPeerRef.current.destroy();
    }
    navigate('/');
  };
  
  const toggleChat = () => {
    setIsChatOpen(prev => !prev);
    if (!isChatOpen) {
      setIsParticipantsOpen(false);
    }
  };
  
  const toggleParticipants = () => {
    setIsParticipantsOpen(prev => !prev);
    if (!isParticipantsOpen) {
      setIsChatOpen(false);
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-black">
      <div className="flex items-center justify-between px-4 py-2 text-white bg-black">
        <div className="flex items-center">
          <div className="w-8 h-8">
            <img src="/vidula-new-logo.svg" alt="Vidula Logo" className="object-contain w-full h-full" />
          </div>
          <span className="mx-2 text-gray-500">|</span>
          <span className="text-sm text-gray-300">Room ID: {roomId}</span>
        </div>
        <div className="text-sm">
          <span>{Object.keys(participants).length} participants</span>
        </div>
      </div>
      
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <VideoGrid 
            peers={peers} 
            myStream={myStream} 
            myVideoRef={myVideoRef} 
            isScreenSharing={isScreenSharing} 
            userName={actualUserName} 
            myPeerId={myPeerId.current} 
            participants={participants}
            isRoomCreator={isRoomCreator} 
          />
        </div>
        
        {isParticipantsOpen && (
          <div className="w-80 bg-[#1a1a1a] border-l border-[#333] overflow-y-auto">
            <Participants 
              participants={participants} 
              currentUserId={myPeerId.current} 
            />
          </div>
        )}
        
        {isChatOpen && (
          <div 
            style={{ 
              position: 'fixed', 
              right: 0, 
              top: 0, 
              bottom: 72, 
              width: '320px',
              zIndex: 1000, 
              backgroundColor: '#1a1a1a',
              borderLeft: '1px solid #333',
              boxShadow: '-2px 0 10px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 15px',
              borderBottom: '1px solid #333',
              backgroundColor: '#1a1a1a'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: 'white' }}>Chat</h2>
              <button 
                onClick={() => setIsChatOpen(false)}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: '18px' }}>&times;</span>
              </button>
            </div>
            
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '15px',
              color: 'white'
            }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '50px', color: '#9ca3af' }}>
                  <p>No messages yet</p>
                  <p style={{ marginTop: '8px', fontSize: '14px' }}>
                    Messages sent here are only seen<br />by people in the call
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    style={{
                      textAlign: msg.userId === myPeerId.current ? 'right' : 'left',
                      marginBottom: '10px'
                    }}
                  >
                    {msg.userId !== myPeerId.current && (
                      <div style={{ fontSize: '14px', marginBottom: '4px', color: '#d1d5db' }}>
                        {msg.userName}
                      </div>
                    )}
                    <div style={{
                      display: 'inline-block',
                      backgroundColor: msg.userId === myPeerId.current ? '#2563eb' : '#374151',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      maxWidth: '80%'
                    }}>
                      {msg.message}
                      <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div style={{
              padding: '10px 15px',
              borderTop: '1px solid #333',
              backgroundColor: '#1a1a1a'
            }}>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.target.elements.messageInput;
                  const message = input.value.trim();
                  if (message) {
                    sendMessage(message);
                    input.value = '';
                  }
                }}
                style={{ display: 'flex', gap: '8px' }}
              >
                <input
                  name="messageInput"
                  type="text"
                  placeholder="Type a message..."
                  style={{
                    flex: 1,
                    backgroundColor: '#374151',
                    color: 'white',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    outline: 'none',
                    height: '40px'
                  }}
                />
                <button 
                  type="submit"
                  style={{
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    cursor: 'pointer'
                  }}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      
      <Controls 
        toggleAudio={toggleAudio} 
        toggleVideo={toggleVideo} 
        toggleScreenShare={toggleScreenShare} 
        leaveMeeting={leaveMeeting} 
        toggleChat={toggleChat} 
        toggleParticipants={toggleParticipants} 
        isAudioEnabled={isAudioEnabled} 
        isVideoEnabled={isVideoEnabled} 
        isScreenSharing={isScreenSharing} 
        isChatOpen={isChatOpen} 
        isParticipantsOpen={isParticipantsOpen}
        isRoomCreator={isRoomCreator}
      />
    </div>
  );
};

export default Room;