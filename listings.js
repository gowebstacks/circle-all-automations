const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// hubspot api key
const apiKey = process.env.hapikey;

function unescapehtml(htmlStr) {
    htmlStr = htmlStr.replace(/&lt;/g, "<");
    htmlStr = htmlStr.replace(/&gt;/g, ">");
    htmlStr = htmlStr.replace(/&quot;/g, "\"");
    htmlStr = htmlStr.replace(/&#39;/g, "\'");
    htmlStr = htmlStr.replace(/&amp;/g, "&");
    return htmlStr;
}

(async () => {
    let listings = {
        // read current data in hubdb
        init: async function () {
            console.log('init');
            var self = this;
            await axios.get('https://api.hubapi.com/cms/v3/hubdb/tables/4555547/rows', {
                params: {
                    hapikey: apiKey
                }
            }).then(async function (data) {
                await self.clear(data.data);
            }, (error) => {
                console.log(error);
            });
        },
        // clear the table of all data
        clear: async function (data) {
            console.log('clear');
            var self = this;
            let ids = { 'inputs': [] };
            for (let i = 0; i < data.results.length; i++) {
                result = data.results[i];
                ids['inputs'].push(result.id);
            }

            await axios.post('https://api.hubapi.com/cms/v3/hubdb/tables/4555547/rows/draft/batch/purge', ids, {
                params: {
                    hapikey: apiKey
                },
                responseType: "application/json",
            }).then(async function (data) {
                await self.get();
            }, (error) => {
                console.log(error);
            });

        },
        // read data from all relevant greenhouse boards
        get: async function () {
            console.log('get');
            var self = this;

            const boards = [
                'circle',
                'circlejobs',
                'circlejobpostings'
            ];

            const altIdentifiers = {
                'circle': '',
                'circlejobs': ' ',
                'circlejobpostings': ' Perm'
            };

            await axios.all(boards.map((board) => axios.get(`https://api.greenhouse.io/v1/boards/${board}/departments`)))
                .then(axios.spread(async function (...data) {
                    let mainData = data[0].data;

                    for (let i = 0; i < mainData.departments.length; i++) {
                        for (let j = 0; j < mainData.departments[i].jobs.length; j++) {
                            mainData.departments[i].jobs[j]['board'] = boards[0];
                        }
                    }

                    for (let i = 1; i < data.length; i++) {
                        let curData = data[i].data;
                        for (let j = 0; j < curData.departments.length; j++) {
                            for (let k = 0; k < curData.departments[j].jobs.length; k++) {
                                curData.departments[j].jobs[k]['board'] = boards[i];
                                curData.departments[j].jobs[k]['title'] += altIdentifiers[boards[i]];
                            }
                        }

                        for (let j = 0; j < mainData.departments.length; j++) {
                            mainData.departments[j].jobs = mainData.departments[j].jobs.concat(curData.departments[j].jobs);
                        }
                    }
                    await self.organize(mainData);

                }), (error) => {
                    console.log(error);
                });
        },
        // expand data and rebuild it into more useful objects
        organize: async function (data) {
            console.log('organize');
            var self = this;

            let boards = {};

            let jobs = {};
            let depts = {};
            let locs = {};
            let descs = {};
            for (let i = 0; i < data.departments.length; i++) {
                let department = data.departments[i];
                for (let j = 0; j < department.jobs.length; j++) {
                    let job = department.jobs[j];
                    const curTitle = job.title.trim();
                    if (jobs.hasOwnProperty(curTitle)) {
                        jobs[curTitle].push(job.absolute_url);
                        locs[curTitle].push(job.location.name);
                    } else {
                        depts[curTitle] = department['name'];
                        locs[curTitle] = [job.location.name];
                        jobs[curTitle] = [job.absolute_url];
                        boards[curTitle] = job.board;
                    }
                }
            }

            for (const title in jobs) {
                const id = jobs[title][0].split('/').pop();
                const board = boards[title];
                await axios.get(`https://api.greenhouse.io/v1/boards/${board}/jobs/${id}`)
                    .then(async function (data) {
                        descs[title] = unescapehtml(data.data.content);
                    }, (error) => {
                        console.log(error);
                    });
            }
            await self.post(jobs, depts, locs, descs);
        },
        // upload new data to hubdb table
        post: async function (jobs, depts, locs, descs) {
            console.log('post');
            var self = this;

            for (const title in jobs) {
                let links = "<ul>";
                jobs[title].forEach((link) => {
                    links += "<li>" + link + "</li>";
                });
                links += "</ul>";

                let locations = "<ul>";
                locs[title].forEach((loc) => {
                    locations += "<li>" + loc.split('-')[0].trim() + "</li>";
                });
                locations += "</ul>";
                let body = {
                    "path": title.toLowerCase(),
                    "values": {
                        "links": links,
                        "locations": locations,
                        "department": depts[title],
                        "name": title,
                        "description": descs[title],
                    },
                    "name": title
                }
                try {
                    const resp = await axios.post('https://api.hubapi.com/cms/v3/hubdb/tables/4555547/rows', body, {
                        params: {
                            hapikey: apiKey
                        },
                        responseType: "application/json"
                    });
                    console.log("post success " + body.name);
                } catch (err) {
                    console.error("post error " + body.name);
                }
            }

            await self.publish();
        },
        // publish hubdb table
        publish: async function () {
            console.log('publish');
            var self = this;
            await axios.post('https://api.hubapi.com/cms/v3/hubdb/tables/4555547/draft/push-live', {}, {
                params: {
                    hapikey: apiKey
                }
            }).then(async function (data) {
                console.log('complete');
            }, (error) => {
                console.log(error);
            });
        }
    }
    await (listings.init());
})();