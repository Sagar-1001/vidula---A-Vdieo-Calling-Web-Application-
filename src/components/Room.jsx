import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import Controls from './Controls';
import VideoGrid from './VideoGrid';
import Participants from './Participants';
import WaitingLobby from './WaitingLobby';

const Room = ({ userName, onRoomEnter, onRoomExit }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [actualUserName] = useState(userName || `Guest-${Math.floor(Math.random() * 10000)}`);
  const [myStream, setMyStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [participants, setParticipants] = useState({});
  const [peerStreams, setPeerStreams] = useState({});
  const [messages, setMessages] = useState([]);
  
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [roomIdCopied, setRoomIdCopied] = useState(false);
  
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const myPeerIdRef = useRef(null);
  const myVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const mountedRef = useRef(true);
  
  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId)
      .then(() => {
        setRoomIdCopied(true);
        setTimeout(() => setRoomIdCopied(false), 2000);
      })
      .catch(err => {
        const textArea = document.createElement('textarea');
        textArea.value = roomId;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setRoomIdCopied(true);
          setTimeout(() => setRoomIdCopied(false), 2000);
        } catch (err) {
          console.error('Copy failed:', err);
        }
        document.body.removeChild(textArea);
      });
  }, [roomId]);
  
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    
    Object.entries(peerConnectionsRef.current).forEach(([userId, connection]) => {
      try {
        connection.close();
      } catch (e) {}
    });
    peerConnectionsRef.current = {};
    
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch (e) {}
      peerRef.current = null;
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    sessionStorage.removeItem('isCreatingMeeting');
    sessionStorage.removeItem('roomType');
    sessionStorage.removeItem('createdRoomId');
  }, []);
  
  const addPeerStream = useCallback((userId, stream) => {
    if (!mountedRef.current) return;
    
    setPeerStreams(prev => {
      return { ...prev, [userId]: stream };
    });
  }, []);
  
  const removePeerStream = useCallback((userId) => {
    if (!mountedRef.current) return;
    
    setPeerStreams(prev => {
      const newStreams = { ...prev };
      delete newStreams[userId];
      return newStreams;
    });
    
    if (peerConnectionsRef.current[userId]) {
      try {
        peerConnectionsRef.current[userId].close();
      } catch (e) {}
      delete peerConnectionsRef.current[userId];
    }
  }, []);
  
  const callUser = useCallback((targetUserId, targetUserName) => {
    if (!peerRef.current || !streamRef.current) {
      return;
    }
    
    if (peerConnectionsRef.current[targetUserId]) {
      return;
    }
    
    try {
      const call = peerRef.current.call(targetUserId, streamRef.current);
      
      if (!call) {
        return;
      }
      
      peerConnectionsRef.current[targetUserId] = call;
      
      call.on('stream', (remoteStream) => {
        addPeerStream(targetUserId, remoteStream);
      });
      
      call.on('close', () => {
        removePeerStream(targetUserId);
      });
      
      call.on('error', (error) => {
        removePeerStream(targetUserId);
      });
      
    } catch (error) {}
  }, [addPeerStream, removePeerStream]);
  
  useEffect(() => {
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    mountedRef.current = true;
    
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (!mountedRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        streamRef.current = stream;
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
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' }
            ],
            sdpSemantics: 'unified-plan'
          }
        });
        
        peerRef.current = peer;
        
        peer.on('open', (peerId) => {
          if (!mountedRef.current) return;
          
          myPeerIdRef.current = peerId;
          
          const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
          });
          
          socketRef.current = socket;
          
          socket.on('connect', () => {
            if (!mountedRef.current) return;
            
            setConnectionStatus('connected');
            
            const isCreating = sessionStorage.getItem('isCreatingMeeting') === 'true';
            const roomType = sessionStorage.getItem('roomType') || 'public';
            
            if (isCreating) {
              socket.emit('join-room', roomId, peerId, actualUserName, roomType);
            } else {
              socket.emit('request-join-room', roomId, peerId, actualUserName);
            }
          });
          
          socket.on('connect_error', (error) => {
            setConnectionStatus('failed');
          });
          
          socket.on('join-approved', (approvedRoomId) => {
            if (!mountedRef.current) return;
            setConnectionStatus('connected');
            socket.emit('join-room', approvedRoomId, peerId, actualUserName, 'public');
          });
          
          socket.on('join-denied', (message) => {
            alert(message || 'The host denied your request to join');
            cleanup();
            navigate('/');
          });
          
          socket.on('waiting-for-approval', (message) => {
            if (!mountedRef.current) return;
            setConnectionStatus('waiting');
          });
          
          socket.on('creator-status', (isCreator) => {
            if (!mountedRef.current) return;
            setIsRoomCreator(isCreator);
          });
          
          socket.on('all-participants', (participantsList) => {
            if (!mountedRef.current) return;
            
            const participantsObj = {};
            participantsList.forEach(p => {
              participantsObj[p.userId] = p;
            });
            setParticipants(participantsObj);
          });
          
          socket.on('user-joined', (userData) => {
            if (!mountedRef.current) return;
            
            setParticipants(prev => ({
              ...prev,
              [userData.userId]: userData
            }));
          });
          
          socket.on('call-user', ({ targetUserId, targetUserName }) => {
            if (!mountedRef.current) return;
            
            setTimeout(() => {
              if (mountedRef.current) {
                callUser(targetUserId, targetUserName);
              }
            }, 1000);
          });
          
          socket.on('user-left', (userId) => {
            if (!mountedRef.current) return;
            
            removePeerStream(userId);
            
            setParticipants(prev => {
              const newParticipants = { ...prev };
              delete newParticipants[userId];
              return newParticipants;
            });
          });
          
          socket.on('participant-video-toggle', (userId, enabled) => {
            if (!mountedRef.current) return;
            setParticipants(prev => ({
              ...prev,
              [userId]: { ...prev[userId], videoEnabled: enabled }
            }));
          });
          
          socket.on('participant-audio-toggle', (userId, enabled) => {
            if (!mountedRef.current) return;
            setParticipants(prev => ({
              ...prev,
              [userId]: { ...prev[userId], audioEnabled: enabled }
            }));
          });
          
          socket.on('participant-screen-share', (userId, isSharing) => {
            if (!mountedRef.current) return;
            setParticipants(prev => ({
              ...prev,
              [userId]: { ...prev[userId], isScreenSharing: isSharing }
            }));
          });
          
          socket.on('receive-message', (messageData) => {
            if (!mountedRef.current) return;
            setMessages(prev => {
              const isDuplicate = prev.some(msg =>
                msg.userId === messageData.userId &&
                msg.message === messageData.message &&
                Math.abs(msg.timestamp - messageData.timestamp) < 2000
              );
              
              if (isDuplicate) return prev;
              
              return [...prev, {
                id: `${messageData.timestamp}-${messageData.userId}`,
                ...messageData
              }];
            });
          });
          
          socket.on('disconnect', (reason) => {
            setConnectionStatus('disconnected');
          });
        });
        
        peer.on('call', (call) => {
          if (!mountedRef.current) return;
          
          call.answer(streamRef.current);
          
          peerConnectionsRef.current[call.peer] = call;
          
          call.on('stream', (remoteStream) => {
            if (!mountedRef.current) return;
            addPeerStream(call.peer, remoteStream);
          });
          
          call.on('close', () => {
            removePeerStream(call.peer);
          });
          
          call.on('error', (error) => {
            removePeerStream(call.peer);
          });
        });
        
        peer.on('error', (error) => {
          if (error.type === 'network') {
            setConnectionStatus('failed');
          }
        });
        
        peer.on('close', () => {});
        
        peer.on('disconnected', () => {});
        
      })
      .catch(error => {
        alert('Cannot access camera/microphone. Please check permissions and try again.');
        setConnectionStatus('failed');
        navigate('/');
      });
    
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [roomId, actualUserName, navigate, callUser, addPeerStream, removePeerStream, cleanup]);
  
  useEffect(() => {
    if (onRoomEnter) onRoomEnter();
    return () => {
      if (onRoomExit) onRoomExit();
    };
  }, [onRoomEnter, onRoomExit]);
  
  const toggleAudio = useCallback(() => {
    if (!streamRef.current) return;
    
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
      
      if (socketRef.current && myPeerIdRef.current) {
        socketRef.current.emit('toggle-audio', roomId, myPeerIdRef.current, audioTrack.enabled);
      }
    }
  }, [roomId]);
  
  const toggleVideo = useCallback(() => {
    if (!streamRef.current) return;
    
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      
      if (socketRef.current && myPeerIdRef.current) {
        socketRef.current.emit('toggle-video', roomId, myPeerIdRef.current, videoTrack.enabled);
      }
    }
  }, [roomId]);
  
  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: 'always' },
          audio: false
        });
        
        screenStreamRef.current = stream;
        setScreenStream(stream);
        
        const screenTrack = stream.getVideoTracks()[0];
        
        const originalVideoTrack = streamRef.current.getVideoTracks()[0];
        
        Object.values(peerConnectionsRef.current).forEach(connection => {
          try {
            const sender = connection.peerConnection
              .getSenders()
              .find(s => s.track && s.track.kind === 'video');
            
            if (sender) {
              sender.replaceTrack(screenTrack)
                .catch(e => {});
            }
          } catch (e) {}
        });
        
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream;
        }
        
        setIsScreenSharing(true);
        
        if (socketRef.current && myPeerIdRef.current) {
          socketRef.current.emit('start-screen-share', roomId, myPeerIdRef.current);
        }
        
        screenTrack.onended = () => {
          stopScreenShare(originalVideoTrack);
        };
        
      } catch (error) {
        if (error.name !== 'NotAllowedError') {
          alert('Failed to share screen. Please try again.');
        }
      }
    } else {
      const originalVideoTrack = streamRef.current.getVideoTracks()[0];
      stopScreenShare(originalVideoTrack);
    }
  }, [isScreenSharing, roomId]);
  
  const stopScreenShare = useCallback((originalVideoTrack) => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    
    if (streamRef.current && originalVideoTrack) {
      Object.values(peerConnectionsRef.current).forEach(connection => {
        try {
          const sender = connection.peerConnection
            .getSenders()
            .find(s => s.track && s.track.kind === 'video');
          
          if (sender) {
            sender.replaceTrack(originalVideoTrack)
              .catch(e => {});
          }
        } catch (e) {}
      });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = streamRef.current;
      }
    }
    
    setIsScreenSharing(false);
    
    if (socketRef.current && myPeerIdRef.current) {
      socketRef.current.emit('stop-screen-share', roomId, myPeerIdRef.current);
    }
  }, [roomId]);
  
  const sendMessage = useCallback((message) => {
    if (!message.trim() || !socketRef.current || !myPeerIdRef.current) return;
    
    socketRef.current.emit('send-message', roomId, message, myPeerIdRef.current, actualUserName);
  }, [roomId, actualUserName]);
  
  const leaveMeeting = useCallback(() => {
    cleanup();
    navigate('/');
  }, [navigate, cleanup]);
  
  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);
    setIsParticipantsOpen(false);
  }, []);
  
  const toggleParticipants = useCallback(() => {
    setIsParticipantsOpen(prev => !prev);
    setIsChatOpen(false);
  }, []);
  
  return (
    <div className="flex flex-col h-screen bg-black">
      <WaitingLobby 
        socketRef={socketRef} 
        isCreator={isRoomCreator} 
        roomId={roomId}
        onDenied={leaveMeeting}
      />
      
      <div className="flex items-center justify-between px-4 py-2 text-white bg-black border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8">
            <img src="/vidula-new-logo.svg" alt="Vidula" className="object-contain w-full h-full" />
          </div>
          <span className="text-gray-500">|</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300 font-mono">{roomId}</span>
            <button
              onClick={copyRoomId}
              className="px-2 py-1 text-xs font-medium text-white transition-colors bg-gray-700 rounded hover:bg-gray-600"
              title="Copy Room ID"
            >
              {roomIdCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-600' :
            connectionStatus === 'connecting' ? 'bg-yellow-600' :
            connectionStatus === 'waiting' ? 'bg-blue-600' :
            'bg-red-600'
          }`}>
            {connectionStatus}
          </span>
        </div>
        <div className="text-sm">
          <span>{Object.keys(participants).length} participant{Object.keys(participants).length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <VideoGrid 
            peers={peerStreams}
            myStream={myStream} 
            myVideoRef={myVideoRef} 
            isScreenSharing={isScreenSharing} 
            userName={actualUserName} 
            myPeerId={myPeerIdRef.current} 
            participants={participants}
            isRoomCreator={isRoomCreator} 
          />
        </div>
        
        {isParticipantsOpen && (
          <div className="w-80 bg-[#1a1a1a] border-l border-[#333] overflow-y-auto">
            <Participants 
              participants={participants} 
              currentUserId={myPeerIdRef.current} 
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
              padding: '12px 16px',
              borderBottom: '1px solid #333',
              backgroundColor: '#1a1a1a'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: 'white', fontWeight: '600' }}>Chat</h2>
              <button 
                onClick={() => setIsChatOpen(false)}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#b91c1c'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#dc2626'}
              >
                ×
              </button>
            </div>
            
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              color: 'white'
            }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '50px', color: '#9ca3af' }}>
                  <p style={{ fontSize: '16px', marginBottom: '8px' }}>No messages yet</p>
                  <p style={{ fontSize: '14px' }}>
                    Start a conversation with other participants
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    style={{
                      textAlign: msg.userId === myPeerIdRef.current ? 'right' : 'left',
                      marginBottom: '12px'
                    }}
                  >
                    {msg.userId !== myPeerIdRef.current && (
                      <div style={{ 
                        fontSize: '13px', 
                        marginBottom: '4px', 
                        color: '#d1d5db',
                        fontWeight: '500'
                      }}>
                        {msg.userName}
                      </div>
                    )}
                    <div style={{
                      display: 'inline-block',
                      backgroundColor: msg.userId === myPeerIdRef.current ? '#2563eb' : '#374151',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      maxWidth: '75%',
                      wordWrap: 'break-word'
                    }}>
                      <div style={{ fontSize: '14px', lineHeight: '1.5' }}>{msg.message}</div>
                      <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div style={{
              padding: '12px 16px',
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
                  autoComplete="off"
                  style={{
                    flex: 1,
                    backgroundColor: '#374151',
                    color: 'white',
                    border: '1px solid #4b5563',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    outline: 'none',
                    fontSize: '14px'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#4b5563'}
                />
                <button 
                  type="submit"
                  style={{
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
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