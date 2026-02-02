import { useEffect, useRef } from 'react';

const VideoGrid = ({ peers, myStream, myVideoRef, userName, myPeerId, participants, isRoomCreator }) => {
  const peerVideoRefs = useRef({});
  const totalParticipants = Object.keys(peers).length + 1;
  
  useEffect(() => {
    Object.entries(peers).forEach(([peerId, stream]) => {
      const videoElement = peerVideoRefs.current[peerId];
      if (videoElement && videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
        videoElement.play().catch(err => console.error('Error playing peer video:', err));
      }
    });
  }, [peers]);
  
  useEffect(() => {
    if (myVideoRef.current && myStream) {
      myVideoRef.current.srcObject = myStream;
      myVideoRef.current.play().catch(err => console.error('Error playing my video:', err));
    }
  }, [myStream, myVideoRef]);
  
  const getGridStyle = () => {
    if (totalParticipants === 1) {
      return { 
        display: 'grid', 
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
        gap: '8px',
        padding: '8px',
        width: '100%',
        height: '100%'
      };
    } else if (totalParticipants === 2) {
      return { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridTemplateRows: '1fr',
        gap: '8px',
        padding: '8px',
        width: '100%',
        height: '100%'
      };
    } else if (totalParticipants <= 4) {
      return { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: '8px',
        padding: '8px',
        width: '100%',
        height: '100%'
      };
    } else {
      return { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'auto',
        gap: '8px',
        padding: '8px',
        width: '100%',
        height: '100%',
        overflowY: 'auto'
      };
    }
  };
  
  const videoContainerStyle = {
    position: 'relative',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    overflow: 'hidden',
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };
  
  const videoElementStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
    backgroundColor: '#000'
  };
  
  const videoOverlayStyle = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
    padding: '10px 14px',
    color: 'white'
  };
  
  const participantNameStyle = {
    fontSize: '14px',
    fontWeight: '600',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
    color: 'white'
  };
  
  const placeholderStyle = {
    ...videoContainerStyle,
    flexDirection: 'column',
    gap: '12px'
  };
  
  const avatarCircleStyle = {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: 'bold',
    color: 'white'
  };
  
  return (
    <div style={{ 
      position: 'relative', 
      flex: 1, 
      overflow: 'hidden', 
      backgroundColor: '#000',
      width: '100%',
      height: '100%'
    }}>
      <div style={getGridStyle()}>
        <div style={videoContainerStyle}>
          <video
            ref={myVideoRef}
            muted
            autoPlay
            playsInline
            style={videoElementStyle}
          />
          <div style={videoOverlayStyle}>
            <div style={participantNameStyle}>
              {userName} (You)
              {isRoomCreator && <span style={{ marginLeft: '8px', color: '#ef4444' }}>• Host</span>}
              {participants[myPeerId]?.isScreenSharing && <span style={{ marginLeft: '8px', color: '#60a5fa' }}>• Screen</span>}
            </div>
          </div>
        </div>
        
        {Object.entries(peers).map(([peerId, stream]) => {
          const participant = participants[peerId];
          const displayName = participant?.userName || participant?.name || 'Loading...';
          
          return (
            <div key={peerId} style={videoContainerStyle}>
              <video
                ref={element => {
                  if (element && !peerVideoRefs.current[peerId]) {
                    peerVideoRefs.current[peerId] = element;
                    element.srcObject = stream;
                    element.play().catch(err => console.error(`Error playing video for ${peerId}:`, err));
                  }
                }}
                autoPlay
                playsInline
                style={videoElementStyle}
              />
              <div style={videoOverlayStyle}>
                <div style={participantNameStyle}>
                  {displayName}
                  {participant?.isCreator && <span style={{ marginLeft: '8px', color: '#ef4444' }}>• Host</span>}
                  {participant?.isScreenSharing && <span style={{ marginLeft: '8px', color: '#60a5fa' }}>• Screen</span>}
                </div>
              </div>
            </div>
          );
        })}
        
        {totalParticipants === 1 && (
          <div style={placeholderStyle}>
            <div style={avatarCircleStyle}>
              <span>👥</span>
            </div>
            <div style={{ color: '#9ca3af', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '4px' }}>
                Waiting for others to join
              </div>
              <div style={{ fontSize: '14px' }}>
                Share the room ID to invite participants
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoGrid;