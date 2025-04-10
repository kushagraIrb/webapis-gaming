const eventsmodel = require('../models/eventsmodel');

class EventsService {
    static async eventsList(page, perPage) {
        try {
            const start = (page - 1) * perPage;
            const eventsList = await eventsmodel.eventsList(start, perPage);
            const totalCount = await eventsmodel.getEventsCount(); // Get total count of events
    
            return { eventsList, totalCount };
        } catch (error) {
            console.error('Error in events service:', error.message);
            throw new Error('Failed to fetch events');
        }
    }    

    static async eventsDetails(id) {
        try {
            // Call the model to fetch event details
            const eventDetails = await eventsmodel.eventsDetails(id);
            return eventDetails;
        } catch (error) {
            console.error('Error in events service:', error.message);
            throw new Error('Failed to fetch event details');
        }
    }    
}

module.exports = EventsService;