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

const activeTweets = {};

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
            try {
                const data = await parseXML(xml.data);

                if (data.root.teaseritem) {
                    const infoSet = [];
                    data.root.teaseritem.sort((a, b) => parseInt(a.teaserdate[0], 10) - parseInt(b.teaserdate[0], 10));

                    for (let item of data.root.teaseritem) {
                        const date = parseInt(item.teaserdate[0], 10);
                        const title = item.teasertitle[0].trim();
                        const text = item.teaser[0].trim();
                        const id = date.toString(16);
                        infoSet.push(id);

                        if (date <= ts) {
                            continue;
                        }

                        console.log(new Date(date * 1000), title, text);
                        const tweet = await T.post('statuses/update', { status: `${title}\n${text}` });
                        activeTweets[id] = tweet.id_str;

                        ts = date;
                        fs.writeFileSync('ts.txt', date);
                    }

                    await Promise.all(
                        Object.keys(activeTweets)
                            .filter(a => !infoSet.includes(a))
                            .map(a => {
                                const id = activeTweets[a];
                                delete activeTweets[a];

                                return T.post('statuses/update', {
                                    in_reply_to_status_id: id,
                                    status: `${config.twitter.handle} Störungsmeldung wieder aufgehoben.`
                                });
                            })
                    );
                }

                await sleep(config.interval * 1000);
            } catch (e) {
                console.error('XML-Error:', e);
            }
        } catch (e) {
            console.error('HTTP-Error:', e.response.status, e.response.statusText);
        }
    }
})();
