const { logger } = require('../logger');
const eventsService = require('../services/eventsService');

class EventsController {
    async events(req, res) {
        try {
            const { page = 1, perPage = 10 } = req.query; // Default: page 1, 10 items per page
    
            const { eventsList, totalCount } = await eventsService.eventsList(Number(page), Number(perPage));
    
            if (eventsList.length === 0) {
                return res.status(404).send({
                    status: true,
                    message: 'No events available',
                    total: totalCount,
                    data: [],
                });
            }
    
            return res.status(200).send({
                status: true,
                data: eventsList,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Events fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching events:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching events',
                error: error.message,
            });
        }
    }    

    async eventsDetails(req, res) {
        try {
            // Extract event ID from the request parameters
            const { id } = req.params;
    
            // Fetch event details using the service
            const eventDetails = await eventsService.eventsDetails(Number(id));
    
            if (!eventDetails) {
                return res.status(404).send({ status: false, msg: 'Event not found' });
            }
    
            return res.status(200).send({
                status: true,
                data: eventDetails,
            });
        } catch (error) {
            console.error('Error fetching event details:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }    
}

module.exports = new EventsController();