const express = require('express');
const router = express.Router();

const upload = require('../helpers/uploads');

const { otpValidation, signUpValidation, loginValidation, changePwdValidation, editProfileValidation, addAccountValidation } = require('../helpers/userValidation');
const authenticateToken = require('../helpers/authToken');
const userController = require('../controllers/UserController');

router.use(express.json());

router.post('/send-otp', otpValidation, userController.sendOtp);

router.get('/fetch-state', userController.fetchUserState);
router.post('/register', signUpValidation, userController.register);
router.post('/login', loginValidation, userController.login);
router.post('/reset-link', userController.resetLink);
router.post('/forgot-password', userController.forgotPassword);
router.post('/regenerate-access-token', userController.regenerateAccessToken);

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.post('/details', userController.fetchUserDetailsByJwtToken);
router.post('/change-password', changePwdValidation, userController.changePassword);
router.post('/dashboard', userController.userDashboard);
router.post('/edit-profile', upload.single('profile_image'), editProfileValidation, userController.editProfile);
router.post('/add-account', addAccountValidation, userController.addAccount);
router.get('/get-account-details', userController.getAccount);
router.get('/logout', userController.logout);

module.exports = router;