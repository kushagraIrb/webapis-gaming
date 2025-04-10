const { check, body } = require('express-validator');

exports.otpValidation = [
    check('email','Emial is required').not().isEmpty(),
    check('phone','Phone number is required').not().isEmpty(),
]

exports.signUpValidation = [
    check('first_name','First name is required').not().isEmpty(),
    // check('last_name','Last name is required').not().isEmpty(),
    check('phone','Phone is required').not().isEmpty(),
    check('email','Email is required').not().isEmpty(),
    check('email','Please enter a valid email').isEmail().normalizeEmail({ gmail_remove_dots:true }),
    check('pincode','Pincode is required').not().isEmpty(),
    check('password','Password must be atleast 6 characters').isLength({ min:6 }),
    check('is_eighteen','18 checkbox is required').not().isEmpty(),
]

exports.loginValidation = [
    check('phone','Phone is required').not().isEmpty(),
    check('password','Password is required').isLength({ min:6 })
]

exports.changePwdValidation = [
    check('password', 'Password is required and must be at least 8 characters').isLength({ min: 8 }),
    check('conf_password', 'Confirm Password is required').not().isEmpty(),
    body('conf_password').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return true;
    }),
];

exports.editProfileValidation = [
    check('first_name', 'First Name is required').not().isEmpty(),
    check('last_name', 'Last Name is required').not().isEmpty()
];

exports.addAccountValidation = [
    check('holder_name','Holder name is required').not().isEmpty(),
    check('account','Account is required').not().isEmpty(),
    check('ifsc_code','IFSC Code is required').not().isEmpty(),
    check('bank_name','Bank Name is required').not().isEmpty(),
    check('account_type','Select account type').not().isEmpty(),
    check('upi_id','UPI ID is required').not().isEmpty(),
    check('phone_pay','Phone Pay Number is required').not().isEmpty(),
    check('g_pay','Goggle Pay Number is required').not().isEmpty(),
    check('paytm','Paytm Number is required').not().isEmpty(),
];