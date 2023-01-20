const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// hubspot api key
// hidden as an environment variable in production
const accessToken = process.env.accessToken;
// props required for the calculation
// props used in formula (including result prop)
let required_props = ['expected_monthly_transactions', 'fixed_fee', 'expected_monthly_volume', 'interest_rate', 'price', 'projected_revenue'];
// prop to be updated
let evauluated_prop = 'projected_revenue';
// HubSpot API paginates its requests for CRM objects
// this loop asynchronously recurses through these requests
let pagination = '';
const run = async () => {
  while (true) {
    // GET request for all objects
    let getOptions = {
      method: 'GET',
      url: 'https://api.hubapi.com/crm/v3/objects/line_items',
      params: {
        properties: required_props.join(),
        archived: 'false',
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        accept: 'application/json'
      }
    };
    // update request if this is recursive pagination
    if (pagination) {
      getOptions.params['after'] = pagination;
    }
    const resp = await axios(getOptions);
    const items = resp.data;
    // parsing each object for evaluated prop update
    for (let i = 0; i < items['results'].length; i++) {
      let element = items['results'][i];
      let props = element['properties'];
      // confirm presence of all variables in the calculation
      required_props.forEach((prop => {
        if (!props[prop]) {
          props[prop] = 0;
        }
      }));
      // preset formula to determine evaluated prop
      const prev_prop = props[evauluated_prop];
      props[evauluated_prop] = parseFloat(props['expected_monthly_transactions'] * 12 * props['fixed_fee']) + parseFloat((props['expected_monthly_volume'] * 12 * props['interest_rate']) / 100) + parseFloat(props['price']);
      if (prev_prop != props[evauluated_prop]) {
        console.log("new prop evaluated: " + props[evauluated_prop]);
        // update objects with newly evalutated property via PATCH request
        let patchOptions = {
          method: 'PATCH',
          url: 'https://api.hubapi.com/crm/v3/objects/line_items/' + props['hs_object_id'],
          headers: { accept: 'application/json', 'content-type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
          data: { properties: { projected_revenue: props[evauluated_prop] } }
        };
        const postresp = await axios(patchOptions);
      }
    }
    // prepare or break from recursion
    if (items['paging']) {
      pagination = (items['paging']['next']['after']);
    } else {
      break;
    }
  }
}

run()