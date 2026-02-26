import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';

const ScheduledMeetings = forwardRef(({ isLoggedIn, onJoinMeeting }, ref) => {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const navigate = useNavigate();
  
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUpcomingMeetings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/meetings/upcoming`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setMeetings(data.meetings || []);
      } else {
        setError(data.message || 'Failed to fetch meetings');
      }
    } catch (error) {
      console.error('Error fetching meetings:', error);
      setError('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  // Expose refresh method to parent via ref
  useImperativeHandle(ref, () => ({
    refresh: fetchUpcomingMeetings
  }));

  useEffect(() => {
    if (isLoggedIn) {
      fetchUpcomingMeetings();
    } else {
      setLoading(false);
    }
  }, [isLoggedIn]);

  const handleJoinMeeting = (meetingId) => {
    // Use the parent's join function if provided, otherwise use default
    if (onJoinMeeting) {
      onJoinMeeting(meetingId);
    } else {
      // Fallback to basic navigation
      sessionStorage.setItem('isCreatingMeeting', 'false');
      sessionStorage.setItem('joiningRoomId', meetingId);
      navigate(`/room/${meetingId}`);
    }
  };

  const handleCancelMeeting = async (meetingId, e) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to cancel this meeting?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/meetings/${meetingId}/cancel`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setMeetings(meetings.filter(m => m.meetingId !== meetingId));
        alert('Meeting cancelled successfully');
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to cancel meeting');
      }
    } catch (error) {
      console.error('Error cancelling meeting:', error);
      alert('Failed to cancel meeting');
    }
  };

  const handleCopyLink = (meetingId, e) => {
    e.stopPropagation();
    const link = `${window.location.origin}/room/${meetingId}`;
    navigator.clipboard.writeText(link)
      .then(() => {
        alert('Meeting link copied to clipboard!');
      })
      .catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = link;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Meeting link copied!');
      });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });

    if (diffMins < 0) {
      return `Started - ${timeStr}`;
    } else if (diffMins < 60) {
      return `In ${diffMins} minutes - ${timeStr}`;
    } else if (diffHours < 24) {
      return `In ${diffHours} hours - ${timeStr}`;
    } else if (diffDays === 0) {
      return `Today at ${timeStr}`;
    } else if (diffDays === 1) {
      return `Tomorrow at ${timeStr}`;
    } else {
      const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      return `${dateStr} at ${timeStr}`;
    }
  };

  const canJoinNow = (scheduledAt) => {
    if (!scheduledAt) return true;
    
    const scheduledTime = new Date(scheduledAt);
    const now = new Date();
    const diffMinutes = (scheduledTime - now) / 60000;
    
    return diffMinutes <= 15;
  };

  if (!isLoggedIn) {
    return null;
  }

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 p-6">
        <div className="text-center text-gray-600">Loading meetings...</div>
      </div>
    );
  }

  if (meetings.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Upcoming Meetings ({meetings.length})
        </h2>

        <div className="space-y-4">
          {meetings.map((meeting) => (
            <div
              key={meeting._id}
              className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
              onClick={() => canJoinNow(meeting.scheduledAt) && handleJoinMeeting(meeting.meetingId)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {meeting.title}
                    </h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      meeting.roomType === 'private' 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {meeting.roomType === 'private' ? '🔒 Private' : '🌍 Public'}
                    </span>
                  </div>

                  {meeting.description && (
                    <p className="text-sm text-gray-600 mb-2">
                      {meeting.description}
                    </p>
                  )}

                  {meeting.isScheduled && meeting.scheduledAt && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">{formatDateTime(meeting.scheduledAt)}</span>
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-500 font-mono">
                    ID: {meeting.meetingId.slice(0, 8)}...
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  {canJoinNow(meeting.scheduledAt) ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJoinMeeting(meeting.meetingId);
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      Join Now
                    </button>
                  ) : (
                    <button
                      disabled
                      className="px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm font-medium"
                    >
                      Not Yet
                    </button>
                  )}

                  <button
                    onClick={(e) => handleCopyLink(meeting.meetingId, e)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Copy Link
                  </button>

                  <button
                    onClick={(e) => handleCancelMeeting(meeting.meetingId, e)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

ScheduledMeetings.displayName = 'ScheduledMeetings';

export default ScheduledMeetings;