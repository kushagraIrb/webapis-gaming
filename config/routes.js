// Import all routers in one array for easy scalability
const routes = [
    { path: '/api/users', router: require('../routes/userRouter') },
    { path: '/api/wallet', router: require('../routes/walletRouter') },
    { path: '/api/live-bet', router: require('../routes/liveBetRouter') },
    { path: '/api/events', router: require('../routes/eventsRouter') },
    { path: '/api/about-us', router: require('../routes/aboutUsRouter') },
    { path: '/api/contact-us', router: require('../routes/contactUsRouter') },
    { path: '/api/close-bet', router: require('../routes/closeBetRouter') },
    { path: '/api/bet-list', router: require('../routes/betListRouter') },
    { path: '/api/deposit', router: require('../routes/depositRouter') },
    { path: '/api/account', router: require('../routes/accountsHistoryRouter') },
    { path: '/api/ticket', router: require('../routes/ticketRouter') },
    { path: '/api/withdrawal', router: require('../routes/withdrawalRouter') },
    { path: '/api/rules', router: require('../routes/rulesRouter') },
    { path: '/api/blogs', router: require('../routes/blogsRouter') },
    { path: '/api/maintenance', router: require('../routes/maintenanceRouter') },
    { path: '/api/notifications', router: require('../routes/notificationRouter') },
    { path: '/api/bonus', router: require('../routes/bonusRouter') },
    { path: '/api/win-list', router: require('../routes/winListRouter') },
    { path: '/api/coin-flip', router: require('../routes/coinFlipRouter') },
];

module.exports = (app) => {
    // Loop through the routes array and apply the routes dynamically
    routes.forEach(route => {
        app.use(route.path, route.router);
    });
};