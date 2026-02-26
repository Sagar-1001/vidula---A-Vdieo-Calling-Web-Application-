import express from 'express';
import { 
  createMeeting, 
  getMeetingDetails, 
  joinMeeting, 
  endMeeting, 
  getUserMeetings, 
  saveChatMessage,
  scheduleMeeting,
  getUpcomingMeetings,
  cancelScheduledMeeting
} from '../controllers/meetingController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/create', auth, createMeeting);
router.post('/schedule', auth, scheduleMeeting);
router.get('/upcoming', auth, getUpcomingMeetings);
router.delete('/:meetingId/cancel', auth, cancelScheduledMeeting);
router.get('/:meetingId', auth, getMeetingDetails);
router.post('/:meetingId/join', auth, joinMeeting);
router.post('/:meetingId/end', auth, endMeeting);
router.get('/user/meetings', auth, getUserMeetings);
router.post('/:meetingId/messages', auth, saveChatMessage);

export default router;