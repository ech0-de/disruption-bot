const fs = require('fs');
const Twit = require('twit');
const parseXML = require('util').promisify(require('xml2js').parseString);
const axios = require('axios');

const sleep = time => new Promise(resolve => setTimeout(resolve, time));
const config = require('./config');

let ts = 0;
try {
    ts = parseInt(fs.readFileSync('ts.txt'), 10);
} catch (e) {
    fs.writeFileSync('ts.txt', 0);
}

const T = new Twit({
    consumer_key: config.twitter.consumer_key,
    consumer_secret: config.twitter.consumer_secret,
    access_token: config.twitter.access_token,
    access_token_secret: config.twitter.access_token_secret,
    strictSSL: true
});

(async () => {
    while (true) {
        try {
            const xml = await axios.get(config.xml_feed);
            const data = await parseXML(xml.data);

            if (data.root.teaseritem) {
                data.root.teaseritem.sort((a, b) => parseInt(a.teaserdate[0], 10) - parseInt(b.teaserdate[0], 10));

                for (let item of data.root.teaseritem) {
                    const date = parseInt(item.teaserdate[0], 10);
                    const title = item.teasertitle[0].trim();
                    const text = item.teaser[0].trim();

                    if (date <= ts) {
                        continue;
                    }

                    console.log(new Date(date * 1000), title, text);
                    await T.post('statuses/update', { status: `${title}\n${text}` });

                    ts = date;
                    fs.writeFileSync('ts.txt', date);
                }
            }

            await sleep(config.interval * 1000);
        } catch (e) {
            console.log('Error', e);
        }
    }
})();
