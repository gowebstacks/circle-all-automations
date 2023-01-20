const axios = require("axios");
const dotenv = require("dotenv");
const qs = require('qs');

dotenv.config();

const accessToken = process.env.accessToken;
const clientID = process.env.clientID;
const clientSecret = process.env.clientSecret;
const pool = process.env.pool;


(async () => {
    // retrieve hubspot tickets + associated contacts
    async function getContacts() {
        console.log('retrieving contacts');
        let recentContacts = [];

        // relevant data to query in requests
        const ticketProperties = ['closed_date', 'issue_category', 'subject', 'time_to_close', 'ticket_id', 'hs_pipeline', 'hubspot_owner_id', 'revenue_classification'];
        const ticketParams = ticketProperties.join(',');

        const ticketPropTransform = {
            'closed_date': 'closed_date',
            'issue_category': 'issue_category',
            'subject': 'subject',
            'time_to_close': 'time_to_close',
            'hs_object_id': 'ticket_id',
            'hs_pipeline': 'pipeline',
            'hubspot_owner_id': 'extRef',
            'revenue_classification': 'revenue_classification'
        }

        const contactProperties = [
            'createdate', 'email', 'firstname', 'lastname', 'hs_object_id',
            'hs_ip_timezone', 'qualtrics_first_name', 'qualtrics_last_name', 'company', 'qualtrics_region'
        ];
        const contactParams = contactProperties.join(',');

        const contactPropTransform = {
            'firstname': 'firstName',
            'lastname': 'lastName',
            'hs_ip_timezone': 'ip_timezone'
        }

        // time data to calculate recent tickets
        const timeStamp = Math.round(new Date().getTime() / 1000);
        const timeStampYesterday = timeStamp - ((24 * 3600));
        const yesterday = new Date(timeStampYesterday * 1000);

        let pagination;
        const supportPipeline = '0';

        // start with all tickets
        // recursive loop through paginated data
        while (true) {
            let config = {
                method: 'get',
                url: `https://api.hubapi.com/crm/v3/objects/tickets?properties=${ticketParams}&associations=contact&associations=contact&limit=100`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            };
            if (pagination) {
                config.url += '&after=' + pagination;
            }

            const response = await axios(config);
            response.data.results.forEach((item, index) => {
                // filter for tickets with associated contact, closed date, pipeline -> support, and blacklist certain issue categories
                if (item.associations && item.properties.closed_date && item.properties.hs_pipeline == supportPipeline && item.properties.issue_category !== 'Security Concerns') {
                    for (let contact of item.associations.contacts.results) {
                        const contactID = contact.id;

                        // filter by closed within 24 hours
                        const closedDate = (item.properties.closed_date).split('-');
                        const year = parseInt(closedDate[0]);
                        const month = parseInt(closedDate[1]);
                        const date = parseInt(closedDate[2].split('T')[0]);

                        const isRecent = (date === yesterday.getDate() && month === yesterday.getMonth() + 1 && year === yesterday.getFullYear());
                        if (isRecent) {
                            let ticketInfo = item.properties;
                            ticketInfo['contactID'] = contactID;
                            recentContacts.push(ticketInfo);
                        }
                    }
                }
            });

            if (response.data.paging) {
                pagination = (response.data.paging.next.after);
            } else {
                break;
            }
        }

        let fullContacts = [];

        // fill out contact data
        for (let contact of recentContacts) {
            const contactID = contact['contactID'];

            let config = {
                method: 'get',
                url: `https://api.hubapi.com/crm/v3/objects/contacts/${contactID}?properties=${contactParams}`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            };

            const response = await axios(config);
            let curContact = response.data.properties;

            // modify existing contact data to fit qualtrics naming scheme
            Object.entries(contactPropTransform).forEach(prop => {
                const [hsData, qualData] = prop;
                curContact[qualData] = curContact[hsData];
            });

            // add previous ticket data in current item, also fitting qualtrics naming scheme
            Object.entries(ticketPropTransform).forEach(prop => {
                const [hsData, qualData] = prop;
                curContact[qualData] = contact[hsData];
            });


            // filter out circle.com emails
            if (!curContact['email'].includes('circle.com')) {
                fullContacts.push(curContact);
            }
        };

        // add ticket owner name
        for (let i = 0; i < fullContacts.length; i++) {
            const ownerID = fullContacts[i]['extRef'];
            let config = {
                method: 'get',
                url: `https://api.hubapi.com/crm/v3/owners/${ownerID}?idProperty=id`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            };

            const response = (await axios(config)).data;
            const name = response.firstName + ' ' + response.lastName;
            fullContacts[i]['ticket_owner_name'] = name;
        }

        await auth(fullContacts);
    }

    // authenticate with qualtrics
    async function auth(contacts) {
        console.log('authenticating');
        const authCreds = Buffer.from((clientID + ':' + clientSecret)).toString('base64');

        var data = qs.stringify({
            'grant_type': 'client_credentials',
            'scope': 'manage:all'
        });

        var config = {
            method: 'post',
            url: 'https://iad1.qualtrics.com/oauth2/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + authCreds
            },
            data: data
        };

        axios(config)
            .then(function (response) {
                const token = response.data.access_token;
                sendContacts(token, contacts);
            })
            .catch(function (error) {
                console.log(error);
            });
    }

    // send over data
    async function sendContacts(auth, contacts) {
        console.log('posting contacts');

        const props = ['firstName', 'lastName', 'email', 'extRef'];
        const embeddedProps = [
            'closed_date', 'ticket_name', 'issue_category', 'ticket_id', 'time_to_close',
            'owner_id', 'ip_timezone', 'qualtrics_first_name', 'qualtrics_last_name', 'name',
            'company', 'qualtrics_region', 'ticket_owner_name', 'revenue_classification'
        ];

        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            contact['firstName'] = contact['firstName'] || 'valued';
            contact['lastName'] = contact['lastName'] || 'customer';

            let contactData = {};

            props.forEach(prop => {
                if (contact[prop]) {
                    contactData[prop] = contact[prop];
                }
            });

            contactData['embeddedData'] = {};

            embeddedProps.forEach(prop => {
                if (contact[prop]) {
                    contactData['embeddedData'][prop] = contact[prop];
                }
            });

            contactData['unsubscribed'] = false;

            let data = JSON.stringify(contactData);

            let config = {
                method: 'post',
                url: `https://iad1.qualtrics.com/API/v3/directories/${pool}/contacts`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + auth
                },
                data: data
            };

            await axios(config)
                .then(function () {
                    console.log('successful contact created');
                })
                .catch(function (error) {
                    console.log(error);
                });

        }
        console.log('complete');
    }

    await getContacts();
})();