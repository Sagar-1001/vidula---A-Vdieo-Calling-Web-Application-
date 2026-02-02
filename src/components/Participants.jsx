import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaDesktop } from 'react-icons/fa';

const Participants = ({ participants, currentUserId }) => {
  
  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="w-full h-full bg-[#1a1a1a]">
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">
          Participants ({Object.keys(participants).length})
        </h3>
      </div>
      
      <div className="p-2">
        {Object.entries(participants).map(([id, participant]) => (
          <div 
            key={id} 
            className="flex items-center gap-3 p-3 mb-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333333] transition-colors"
          >
            <div className="flex items-center justify-center w-10 h-10 font-bold text-white rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
              {getInitials(participant.name || participant.userName || 'User')}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {participant.name || participant.userName || 'User'} 
                {id === currentUserId && (
                  <span className="ml-1 text-gray-400">(You)</span>
                )}
                {participant.isCreator && (
                  <span className="ml-1 text-red-500">• Host</span>
                )}
              </div>
              {participant.isScreenSharing && (
                <div className="text-xs text-blue-400">
                  Sharing screen
                </div>
              )}
            </div>
            
            <div className="flex gap-2 flex-shrink-0">
              {participant.audioEnabled === false ? (
                <div className="p-1.5 bg-red-500 rounded-full" title="Muted">
                  <FaMicrophoneSlash className="w-3 h-3 text-white" />
                </div>
              ) : (
                <div className="p-1.5 bg-green-500 rounded-full" title="Audio on">
                  <FaMicrophone className="w-3 h-3 text-white" />
                </div>
              )}
              
              {participant.videoEnabled === false ? (
                <div className="p-1.5 bg-red-500 rounded-full" title="Video off">
                  <FaVideoSlash className="w-3 h-3 text-white" />
                </div>
              ) : (
                <div className="p-1.5 bg-green-500 rounded-full" title="Video on">
                  <FaVideo className="w-3 h-3 text-white" />
                </div>
              )}
              
              {participant.isScreenSharing && (
                <div className="p-1.5 bg-blue-500 rounded-full" title="Sharing screen">
                  <FaDesktop className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Participants;