const express = require('express');
const router = express.Router();

const upload = require('../helpers/uploads');

const { otpValidation, signUpValidation, loginValidation, changePwdValidation, editProfileValidation, addAccountValidation } = require('../helpers/userValidation');
const authenticateToken = require('../helpers/authToken');
const userController = require('../controllers/UserController');
const limits = require('../helpers/rateLimiters');

router.use(express.json());

router.post('/send-otp', limits.otpPerIp, limits.otpPerTarget, otpValidation, userController.sendOtp);

router.post('/check-name', userController.checkNameAvailability);

router.get('/fetch-state', userController.fetchUserState);
router.post('/register', limits.registerPerIp, limits.registerPerTarget, signUpValidation, userController.register);
router.post('/login', limits.loginPerIp, limits.loginPerAccount, loginValidation, userController.login);
router.post('/google/register', userController.googleRegister);
router.post('/google/login', userController.googleLogin);
router.post('/reset-link', limits.passwordReset, userController.resetLink);
router.post('/forgot-password', limits.passwordReset, userController.forgotPassword);
router.post('/regenerate-access-token', limits.tokenRefresh, userController.regenerateAccessToken);

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.put('/update-name', userController.updateUserName);
router.post('/details', userController.fetchUserDetailsByJwtToken);
router.post('/change-password', changePwdValidation, userController.changePassword);
// router.post('/dashboard', userController.userDashboard);
router.post('/edit-profile', upload.single('profile_image'), editProfileValidation, userController.editProfile);
router.post('/add-account', addAccountValidation, userController.addAccount);
router.get('/get-account-details', userController.getAccount);
router.get('/logout', userController.logout);

module.exports = router;
