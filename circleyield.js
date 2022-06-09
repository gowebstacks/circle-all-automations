const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const hapikey = {
  params: {
    hapikey: process.env.hapikey
  }
};

const circleURL = 'https://api.circle.com/v1/yield/products/public';
const hubspotURL = 'https://api.hubapi.com/cms/v3/hubdb/tables/5272649';

const getYieldRates = async () => {
  const res = (await axios.get(circleURL)).data.data;
  let ret = {}
  let count = 1;

  console.log('CIRCLE RESPONSE\n', res, '\n');

  res.forEach(item => {
    ret[`length_${count}`] = `${item.termLength}`;
    ret[`rate_${count}`] = item.customerRate;
    ret[`date_${count}`] = `${Date.parse(item.effectiveDate)}`;
    count++;
  });
  
  return { values: ret }; // format return value for hubspot API
};

const postYieldRates = async (data) => {
  const row = (await axios.get(`${hubspotURL}/rows`, hapikey)).data.results[0]; // there is exactly one row that needs to be updated

  (await axios.patch(`${hubspotURL}/rows/${row.id}/draft`, data, hapikey, { responseType: "application/json" })
    .then((res) => console.log('DRAFT RESPONSE\n', res.data, '\n'))
    .catch((error) => console.log('DRAFT ERROR\n', error, '\n')));

  (await axios.post(`${hubspotURL}/draft/publish`, {}, hapikey)
    .then((res) => console.log('PUBLISH RESPONSE\n', res.data, '\n'))
    .catch((error) => console.log('PUBLISH ERROR\n', error, '\n')));
};

getYieldRates()
  .then((newRates) => postYieldRates(newRates))
  .catch((error) => console.log(error));
