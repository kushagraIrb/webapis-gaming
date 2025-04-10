const notificationModel = require('../models/notificationModel');

class NotificationService {
    static async getNotification() {
        try {
            const notificationDetails = await notificationModel.getNotificationList();
            if (!notificationDetails || notificationDetails.length === 0) {
                throw new Error('No notifications found');
            }
            return notificationDetails;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    static async getNotificationUserCount(user_id) {
        try {
            const notificationDetails = await notificationModel.getNotificationUserCount(user_id);
            return notificationDetails;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    static async updateNotificationStatus(user_id) {
        try {
            const updatedCount = await notificationModel.updateNotificationStatus(user_id);
            return updatedCount;
        } catch (error) {
            throw new Error(error.message);
        }
    }    
}

module.exports = NotificationService;