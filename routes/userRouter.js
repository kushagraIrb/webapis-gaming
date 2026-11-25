const express = require('express');
const router = express.Router();

const upload = require('../helpers/uploads');

const { otpValidation, signUpValidation, loginValidation, changePwdValidation, editProfileValidation, addAccountValidation, totpEnableValidation, totpDisableValidation } = require('../helpers/userValidation');
const authenticateToken = require('../helpers/authToken');
const userController = require('../controllers/UserController');
const requireEmail = require('../helpers/requireEmail');
const limits = require('../helpers/rateLimiters');
const { devOtpEcho } = require('../helpers/otpDelivery');

router.use(express.json());
router.use(devOtpEcho);

router.post('/send-otp', limits.otpPerIp, limits.otpPerTarget, otpValidation, userController.sendOtp);

router.post('/check-name', userController.checkNameAvailability);

router.get('/fetch-state', userController.fetchUserState);
router.post('/register', limits.registerPerIp, limits.registerPerTarget, signUpValidation, userController.register);
router.post('/login', limits.loginPerIp, limits.loginPerAccount, loginValidation, userController.login);
router.post('/login/verify-otp', limits.loginOtpPerIp, limits.loginOtpPerChallenge, userController.verifyLoginOtp);
router.post('/login/resend-otp', limits.loginOtpPerIp, limits.loginOtpResend, userController.resendLoginOtp);
router.post('/login/email-setup/send', limits.loginOtpPerIp, limits.loginOtpResend, userController.loginEmailSetupSend.bind(userController));
router.post('/login/email-setup/resend', limits.loginOtpPerIp, limits.loginOtpResend, userController.loginEmailSetupResend.bind(userController));
router.post('/login/email-setup/confirm', limits.loginOtpPerIp, limits.loginOtpPerChallenge, userController.loginEmailSetupConfirm.bind(userController));
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
router.post('/email-setup/send', limits.accountOtpResend, userController.emailSetupSend.bind(userController));
router.post('/email-setup/resend', limits.accountOtpResend, userController.emailSetupResend.bind(userController));
router.post('/email-setup/confirm', limits.accountOtpPerUser, userController.emailSetupConfirm.bind(userController));
router.post('/add-account', limits.accountOtpPerUser, requireEmail, addAccountValidation, userController.addAccount);
router.get('/get-account-details', userController.getAccount);
router.get('/totp/status', userController.totpStatus.bind(userController));
router.post('/totp/setup', limits.totpPerUser, userController.totpSetup.bind(userController));
router.post('/totp/enable', limits.totpPerUser, totpEnableValidation, userController.totpEnable.bind(userController));
router.post('/totp/disable', limits.totpPerUser, totpDisableValidation, userController.totpDisable.bind(userController));
router.get('/logout', userController.logout);

module.exports = router;
