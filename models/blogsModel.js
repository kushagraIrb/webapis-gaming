const db = require('../config/database');

class BlogsModel {
    static async blogsList(start = null, perPage = null) {
        try {
            let query = `SELECT * FROM tbl_blog WHERE status = 1`;
            const params = [];

            // Add pagination logic if start and perPage are provided
            if (start !== null && perPage !== null) {
                query += ` LIMIT ?, ?`;
                params.push(start, perPage);
            }

            const [results] = await db.promise().query(query, params);
            return results;
        } catch (error) {
            console.error('Error fetching blogs from database:', error.message);
            throw new Error('Database query failed');
        }
    }

    // Get total count of blogs
    static async getBlogsCount() {
        try {
            let query = `SELECT COUNT(*) AS total FROM tbl_blog WHERE status = 1`;

            const [[result]] = await db.promise().query(query);
            return result.total;
        } catch (error) {
            console.error('Error fetching blogs count:', error.message);
            throw new Error('Database query failed');
        }
    }

    static async blogsDetails(slug) {
        try {
            const query = `SELECT * FROM tbl_blog WHERE slug = ?`;
            const [results] = await db.promise().query(query, [slug]);
    
            // Return the first result if found, or null if not found
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            console.error('Error fetching blog details from database:', error.message);
            throw new Error('Database query failed');
        }
    }    
}

module.exports = BlogsModel;