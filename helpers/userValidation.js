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
    check('email','Please enter a valid email').isEmail().normalizeEmail({ gmail_remove_dots:false }),
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

// Maximum lengths are the column sizes of tbl_user_account. Longer values would be cut off
// silently (or fail) when saved, and with the bank account OTP a code would already have been
// emailed for details that can never be saved as typed. Values must be text: an object or array
// would be expanded into SQL by the database layer.
const accountField = (field, requiredMessage, label, max) =>
    check(field, requiredMessage)
        .isString().withMessage(label + ' is invalid').bail()
        .not().isEmpty().bail()
        .isLength({ max }).withMessage(label + ' is too long (maximum ' + max + ' characters)');

exports.addAccountValidation = [
    accountField('holder_name', 'Holder name is required', 'Holder name', 200),
    accountField('account', 'Account is required', 'Account number', 25),
    accountField('ifsc_code', 'IFSC Code is required', 'IFSC code', 25),
    accountField('bank_name', 'Bank Name is required', 'Bank name', 100),
    accountField('account_type', 'Select account type', 'Account type', 150),
    accountField('upi_id', 'UPI ID is required', 'UPI ID', 150),
    accountField('phone_pay', 'Phone Pay Number is required', 'Phone Pay number', 150),
    accountField('g_pay', 'Goggle Pay Number is required', 'Google Pay number', 150),
    accountField('paytm', 'Paytm Number is required', 'Paytm number', 150),
    check('addhar_number').optional({ nullable: true })
        .isString().withMessage('Aadhar number is invalid').bail()
        .isLength({ max: 150 }).withMessage('Aadhar number is too long (maximum 150 characters)'),
];