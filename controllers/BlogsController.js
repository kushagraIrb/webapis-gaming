const { logger } = require('../logger');
const blogsService = require('../services/blogsService');

class BlogsController {
    async blogs(req, res) {
        try {
            // Get pagination parameters from the query (if available)
            const { page = 1, perPage = 10 } = req.query; // Default: page 1, 10 items per page
    
            // Fetch blogs using the service
            const { blogsList, totalCount } = await blogsService.blogsList(Number(page), Number(perPage));
    
            return res.status(200).send({
                status: true,
                data: blogsList,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
            });
        } catch (error) {
            console.error('Error fetching blogs:', error.message);
            logger.error(`Error fetching blogs: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                msg: 'An error occurred',
                error: error.message,
            });
        }
    }    

    async blogsDetails(req, res) {
        try {
            // Extract blog slug from the request parameters
            const { slug } = req.params;
    
            // Fetch blog details using the service
            const blogDetails = await blogsService.blogsDetails(slug);
    
            if (!blogDetails) {
                return res.status(404).send({ status: false, msg: 'Blog not found' });
            }
    
            return res.status(200).send({
                status: true,
                data: blogDetails,
            });
        } catch (error) {
            console.error('Error fetching blog details:', error.message);
            logger.error(`Error fetching blog details: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }    
}

module.exports = new BlogsController();