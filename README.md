# circle-all-automations

These are a series of scripts that automate CMS and CRM data for the Circle site 

## Use Cases
We run all of these scripts on an hourly/daily basis on a cronjob in Heroku. See the [Heroku App](https://dashboard.heroku.com/apps/circle-all-automations) for more details on when these automations run. We typically use these kinds of automations when a request requires handling large amounts of data on a regular basis.

## Automation Details
* `circleusdc.js`- Parses internal Circle API and CoinGecko for data related to USDC and posts it to HubDB for global content use
* `circleyield.js`- Parses internal Circle API for data related to Yield rates and posts it to HubDB, similar to automation listed above
* `listings.js`- Retrieves job post data from multiple Greenhouse boards and posts them to HubDB for dynamically generated pages on the Circle site
* `qualtrics.js`- Retrieves and sorts recent CRM data for tickets and contacts, then sends this data to the survey service Qualtrics

## How to run
### Installation
The scripts use node, so follow standard NPM installation procedures when setting the project up

### Environment Variables
All scripts require the Circle HS API Key to run, refer to Circle developers or our leadership for access to the API Key

Additionally, the Qualtrics integration requires extra authentication variables

### Testing and Running
We do not currently have commands to run the scripts together, so when testing locally use node to run them individually

When testing a script, be careful of endpoints that mutate data! We typically only run functions that retrieve data when testing, and only post when the update has been thoroughly tested. 
