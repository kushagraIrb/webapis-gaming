const { logger } = require('../logger');
const notificationService = require('../services/notificationService');

class NotificationController {
    async notificationList(req, res) {
        try {
            const notifications = await notificationService.getNotification();
            return res.status(200).json({ data: notifications });
        } catch (error) {
            logger.error(`Error fetching notification list: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ message: error.message });
        }
    }

    async notificationUserCount(req, res) {
        try {
            const user_id = req.user_id; // Get usser id from JWT token

            if (!user_id) {
                return res.status(400).json({ message: 'User ID is required' });
            }
    
            const notifications = await notificationService.getNotificationUserCount(user_id);
            return res.status(200).json({ data: notifications });
        } catch (error) {
            logger.error(`Error fetching notification user count: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ message: error.message });
        }
    }
    
    async updateNotificationStatus(req, res) {
        try {
            const user_id = req.user_id; // Get usser id from JWT token
            if (!user_id) {
                return res.status(400).json({ message: 'User ID is required' });
            }
    
            const updatedCount = await notificationService.updateNotificationStatus(user_id);
            return res.status(200).json({ message: 'Notification status updated', data: updatedCount });
        } catch (error) {
            logger.error(`Error fetching notification status: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ message: error.message });
        }
    }
    
    async gamingNotifImg(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ message: "No file uploaded" });
            }
            
            const serverURL = "https://node.development-review.net"; // Change to your actual domain
            const filePath = `${serverURL}/uploads/notification/${req.file.filename}`;
    
            return res.status(200).json({ 
                message: "Notification image updated", 
                filePath: filePath 
            });
        } catch (error) {
            logger.error(`Error fetching notification images: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new NotificationController();