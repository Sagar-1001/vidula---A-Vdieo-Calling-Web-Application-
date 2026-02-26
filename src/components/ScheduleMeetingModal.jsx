import { useState } from 'react';
import { FaCalendar, FaClock, FaLock, FaGlobe } from 'react-icons/fa';

const ScheduleMeetingModal = ({ isOpen, onClose, userName, onScheduleSuccess }) => {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    roomType: 'public'
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.title.trim()) {
      setError('Meeting title is required');
      return;
    }
    
    if (!formData.date || !formData.time) {
      setError('Date and time are required');
      return;
    }
    
    const scheduledDateTime = new Date(`${formData.date}T${formData.time}`);
    const now = new Date();
    
    if (scheduledDateTime <= now) {
      setError('Scheduled time must be in the future');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please login to schedule meetings');
        setIsSubmitting(false);
        return;
      }
      
      const response = await fetch(`${API_URL}/api/meetings/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          scheduledAt: scheduledDateTime.toISOString(),
          roomType: formData.roomType,
          settings: {
            allowChat: true,
            allowScreenShare: true,
            muteParticipantsOnEntry: false
          }
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.message || 'Failed to schedule meeting');
        setIsSubmitting(false);
        return;
      }
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        date: '',
        time: '',
        roomType: 'public'
      });
      
      // Call the success callback to refresh the meetings list
      if (onScheduleSuccess) {
        onScheduleSuccess(data.meeting);
      }
      
      // Close modal
      onClose();
      
      // Show success message
      alert(`Meeting scheduled successfully!\n\nMeeting ID: ${data.meeting.meetingId}\n\nYou can join this meeting from your scheduled meetings list.`);
      
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      setError('Server error. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const getMinDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getMinTime = () => {
    if (formData.date === getMinDateTime()) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return '00:00';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Schedule Meeting
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Meeting Title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g., Team Standup, Client Demo"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Add meeting details, agenda, or notes..."
              rows="3"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <FaCalendar className="inline mr-2" />
                Date *
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                min={getMinDateTime()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <FaClock className="inline mr-2" />
                Time *
              </label>
              <input
                type="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
                min={getMinTime()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Room Type *
            </label>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, roomType: 'public' }))}
                className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
                  formData.roomType === 'public'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FaGlobe className={`text-2xl ${formData.roomType === 'public' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`font-semibold ${formData.roomType === 'public' ? 'text-blue-700' : 'text-gray-700'}`}>
                      Public Room
                    </div>
                    <div className="text-sm text-gray-600">
                      Anyone with the link can join
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, roomType: 'private' }))}
                className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
                  formData.roomType === 'private'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FaLock className={`text-2xl ${formData.roomType === 'private' ? 'text-purple-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`font-semibold ${formData.roomType === 'private' ? 'text-purple-700' : 'text-gray-700'}`}>
                      Private Room
                    </div>
                    <div className="text-sm text-gray-600">
                      Require approval to join
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? 'Scheduling...' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduleMeetingModal;