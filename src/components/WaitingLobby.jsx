import { useState, useEffect } from 'react';

const WaitingLobby = ({ socketRef, isCreator, roomId, onDenied }) => {
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState('');

  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    // -------------------------------------------------------------------------
    // CREATOR: Listen for join requests
    // -------------------------------------------------------------------------
    if (isCreator) {
      const handleJoinRequest = (userData) => {
        console.log('📥 New join request:', userData);
        
        setWaitingUsers(prev => {
          // Prevent duplicates
          const exists = prev.some(u => u.userId === userData.userId);
          if (exists) {
            console.log('⚠️  User already in waiting list');
            return prev;
          }
          return [...prev, userData];
        });
      };

      const handleWaitingRoomUpdate = (list) => {
        console.log('📋 Waiting room updated:', list.length, 'users');
        setWaitingUsers(list || []);
      };

      socket.on('join-request', handleJoinRequest);
      socket.on('waiting-room-updated', handleWaitingRoomUpdate);

      // Request current waiting room list on mount
      socket.emit('get-waiting-room', roomId);

      return () => {
        socket.off('join-request', handleJoinRequest);
        socket.off('waiting-room-updated', handleWaitingRoomUpdate);
      };
    } 
    // -------------------------------------------------------------------------
    // REGULAR USER: Listen for approval/denial
    // -------------------------------------------------------------------------
    else {
      const handleWaitingForApproval = (message) => {
        console.log('⏳ Waiting for approval:', message);
        setIsWaiting(true);
        setWaitingMessage(message);
      };

      const handleJoinDenied = (message) => {
        console.log('❌ Join denied:', message);
        setIsWaiting(false);
        alert(message || 'The host denied your request to join this meeting.');
        if (onDenied) onDenied();
      };

      const handleJoinApproved = () => {
        console.log('✅ Join approved');
        setIsWaiting(false);
        setWaitingMessage('');
      };

      socket.on('waiting-for-approval', handleWaitingForApproval);
      socket.on('join-denied', handleJoinDenied);
      socket.on('join-approved', handleJoinApproved);

      return () => {
        socket.off('waiting-for-approval', handleWaitingForApproval);
        socket.off('join-denied', handleJoinDenied);
        socket.off('join-approved', handleJoinApproved);
      };
    }
  }, [socketRef, isCreator, roomId, onDenied]);

  // ---------------------------------------------------------------------------
  // CREATOR: Approve/Deny handlers
  // ---------------------------------------------------------------------------
  const handleApprove = (userId, userName) => {
    console.log(`✅ Approving: ${userName} (${userId})`);
    
    if (socketRef.current) {
      socketRef.current.emit('approve-join', roomId, userId);
    }
    
    // Optimistically remove from list
    setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
  };

  const handleDeny = (userId, userName) => {
    console.log(`❌ Denying: ${userName} (${userId})`);
    
    if (socketRef.current) {
      socketRef.current.emit('deny-join', roomId, userId);
    }
    
    // Optimistically remove from list
    setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
  };

  // ---------------------------------------------------------------------------
  // RENDER: Waiting screen for users trying to join private room
  // ---------------------------------------------------------------------------
  if (isWaiting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-95">
        <div className="max-w-md p-8 text-center bg-white rounded-2xl shadow-2xl">
          <div className="mb-6">
            {/* Animated Lock Icon */}
            <div className="flex items-center justify-center w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full shadow-lg">
              <svg 
                className="w-12 h-12 text-white animate-pulse" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                />
              </svg>
            </div>
            
            <h2 className="mb-3 text-3xl font-bold text-gray-800">
              Waiting for Approval
            </h2>
            
            <p className="mb-6 text-lg text-gray-600">
              {waitingMessage}
            </p>
            
            {/* Animated Dots */}
            <div className="flex items-center justify-center mb-6 space-x-2">
              <div 
                className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" 
                style={{ animationDelay: '0s' }}
              />
              <div 
                className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" 
                style={{ animationDelay: '0.15s' }}
              />
              <div 
                className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" 
                style={{ animationDelay: '0.3s' }}
              />
            </div>
            
            <p className="text-sm text-gray-500">
              The host will be notified of your request
            </p>
          </div>
          
          <button
            onClick={onDenied}
            className="w-full px-6 py-3 text-base font-semibold text-white transition-all duration-200 bg-gray-600 rounded-lg hover:bg-gray-700 active:scale-95"
          >
            Cancel & Return Home
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Notification panel for creator showing pending requests
  // ---------------------------------------------------------------------------
  if (isCreator && waitingUsers.length > 0) {
    return (
      <div 
        className="fixed z-50 bg-white border-2 border-gray-200 shadow-2xl top-20 right-4 rounded-xl" 
        style={{ maxWidth: '420px', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 text-white bg-blue-600 rounded-full shadow-md">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                Join Requests
              </h3>
              <p className="text-xs text-gray-600">
                {waitingUsers.length} waiting
              </p>
            </div>
          </div>
          
          <div className="flex items-center justify-center w-8 h-8 text-sm font-bold text-white bg-red-500 rounded-full shadow-lg animate-pulse">
            {waitingUsers.length}
          </div>
        </div>
        
        {/* User List */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 80px)' }}>
          <div className="p-3 space-y-3">
            {waitingUsers.map((user) => (
              <div 
                key={user.userId} 
                className="flex items-center justify-between p-4 transition-all duration-200 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 hover:shadow-md"
              >
                {/* User Info */}
                <div className="flex items-center flex-1 gap-3">
                  {/* Avatar */}
                  <div className="flex items-center justify-center flex-shrink-0 w-12 h-12 text-lg font-bold text-white rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-md">
                    {user.userName.charAt(0).toUpperCase()}
                  </div>
                  
                  {/* Name and Time */}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-800 truncate">
                      {user.userName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(user.requestedAt).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-2 ml-3">
                  <button
                    onClick={() => handleApprove(user.userId, user.userName)}
                    className="flex items-center justify-center w-10 h-10 text-white transition-all duration-200 bg-green-500 rounded-lg hover:bg-green-600 active:scale-95 shadow-md"
                    title="Approve"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  
                  <button
                    onClick={() => handleDeny(user.userId, user.userName)}
                    className="flex items-center justify-center w-10 h-10 text-white transition-all duration-200 bg-red-500 rounded-lg hover:bg-red-600 active:scale-95 shadow-md"
                    title="Deny"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-3 text-xs text-center text-gray-500 border-t border-gray-200 bg-gray-50">
          Approve or deny requests to let people join your meeting
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Nothing (default state)
  // ---------------------------------------------------------------------------
  return null;
};

export default WaitingLobby;