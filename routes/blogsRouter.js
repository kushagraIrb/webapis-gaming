const express = require('express');
const router = express.Router();

const blogsController = require('../controllers/BlogsController');

router.use(express.json());

router.get('/', blogsController.blogs);
router.get('/details/:slug', blogsController.blogsDetails);

module.exports = router;