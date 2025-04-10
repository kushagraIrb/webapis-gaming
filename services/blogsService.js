const blogsmodel = require('../models/blogsModel');

class BlogsService {
    static async blogsList(page, perPage) {
        try {
            const start = (page - 1) * perPage;
            const blogsList = await blogsmodel.blogsList(start, perPage);
            const totalCount = await blogsmodel.getBlogsCount(); // Fetch count
    
            return { blogsList, totalCount };
        } catch (error) {
            console.error('Error in blogs service:', error.message);
            throw new Error('Failed to fetch blogs');
        }
    }
    
    static async blogsDetails(slug) {
        try {
            // Call the model to fetch blog details
            const blogDetails = await blogsmodel.blogsDetails(slug);
            return blogDetails;
        } catch (error) {
            console.error('Error in blogs service:', error.message);
            throw new Error('Failed to fetch blog details');
        }
    }    
}

module.exports = BlogsService;