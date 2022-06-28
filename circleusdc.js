const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const hsConfig = {
  params: {
    hapikey: process.env.hapikey
  }
};


const timestamp = `${Date.now()}`;

const hubspotURL = 'https://api.hubapi.com/cms/v3/hubdb/tables/5414018';
// const cgCoins = ['ethereum', 'solana', 'tron', 'algorand', 'stellar', 'avalanche', 'flow', 'hedera', 'usd coin'];
const cgCoins = ['usd coin'];
const circleCoins = {
  'ETH': 'ethereum',
  'SOL': 'solana',
  'TRX': 'tron',
  'ALGO': 'algorand',
  'XLM': 'stellar',
  'AVAX': 'avalanche',
  'FLOW': 'flow',
  'HBAR': 'hedera',
};

const formatter = Intl.NumberFormat('en-US', {
  style: "decimal",
  maximumSignificantDigits: 3,
  minimumFractionDigits: 1,
});

const formatNumber = (number) => {
  let suffix = 'B';
  let ret = number / 1000000000

  if (ret < 1) {
    suffix = 'M';
    ret = number / 1000000;
  }

  ret = formatter.format(ret);
  return `${ret}${suffix}`;
}

const getCircleData = async () => {
  const data = (await axios.get('https://api.circle.com/v1/stablecoins')).data.data;
  let usdcIndex = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i]['symbol'] === 'USDC') {
      usdcIndex = i;
    }
  }
  const res = data[usdcIndex];

  return res.chains.reduce((ret, chain) => {
    if (circleCoins[chain.chain]) {
      ret[circleCoins[chain.chain]] = {
        values: {
          update_date: timestamp,
          total_supply: `$${formatNumber(chain.amount)}`,
        }
      }
    }
    return ret;
  }, { 'usd coin': { values: { update_date: timestamp, total_supply: `$${formatNumber(res.totalAmount)}` } } });
}

const getAllMarketCharts = async () => {
  const res = (await axios.get(`https://api.coingecko.com/api/v3/coins/list`)).data;
  // Create array of promises from coingecko, reduce that array into a format readable for hubspot
  return (await Promise.all(res.filter((coin) => cgCoins.includes(coin.name.toLowerCase())).map(async (coin) => {
    const data = (await axios.get(`https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=0`)).data
    let ret = {}
    ret[coin.name.toLowerCase()] = {
      values: {
        trading_volume_24h: `$${formatNumber(data.total_volumes[0][1])}`,
      }
    }
    return ret;
  }))).reduce((ret, coin) => {
    return { ...coin, ...ret }
  }, {})
}

const postHubspot = async (data) => {
  const rows = (await axios.get(`${hubspotURL}/rows`, hsConfig)).data.results;

  rows.forEach(async (row) => {
    (await axios.patch(`${hubspotURL}/rows/${row.id}/draft`, data[row.values.id], hsConfig)
      .then((res) => console.log('DRAFT RESPONSE\n', res.data, '\n'))
      .catch((error) => console.log('DRAFT ERROR\n', error, '\n')));
  });

  (await axios.post(`${hubspotURL}/draft/publish`, {}, hsConfig)
    .then((res) => console.log('PUBLISH RESPONSE\n', res.data, '\n'))
    .catch((error) => console.log('PUBLISH ERROR\n', error, '\n')));
}

const run = async () => {
  const cgData = (await getAllMarketCharts());
  const circleData = (await getCircleData());
  const allData = { ...cgData, ...circleData }
  console.log(circleData)
  postHubspot(allData);
}

run();