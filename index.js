const fs = require('fs');
const Twit = require('twit');
const crypto = require('crypto');
const parseXML = require('util').promisify(require('xml2js').parseString);
const axios = require('axios');

const sleep = time => new Promise(resolve => setTimeout(resolve, time));
const hash = str => crypto.createHash('sha256').update(str).digest('hex');
const config = require('./config');

let ts = 0;
try {
    ts = parseInt(fs.readFileSync('ts.txt'), 10);
} catch (e) {
    fs.writeFileSync('ts.txt', 0);
}

const infoSet = [];
let activeTweets = {};
try {
    activeTweets = JSON.parse(fs.readFileSync('active.txt'));
    console.log('restoring active.txt', activeTweets);
} catch (e) {
    fs.writeFileSync('active.txt', JSON.stringify(activeTweets));
}

const updateTweet = (id, text) => {
    fs.writeFileSync('active.txt', JSON.stringify(activeTweets));
    return T.post('statuses/update', {
        in_reply_to_status_id: id,
        status: `${config.twitter.handle} ${text}`
    }).catch(e => {
        console.error('Twit-Error:', e.statusCode, e.code, e.message);
    });
};

const T = new Twit({
    consumer_key: config.twitter.consumer_key,
    consumer_secret: config.twitter.consumer_secret,
    access_token: config.twitter.access_token,
    access_token_secret: config.twitter.access_token_secret,
    strictSSL: true
});

(async () => {
    console.log('starting disruption-bot', new Date());

    while (true) {
        try {
            const xml = await axios.get(config.xml_feed);
            try {
                const data = await parseXML(xml.data);
                infoSet.length = 0;

                if (data.root.teaseritem) {
                    data.root.teaseritem.sort((a, b) => parseInt(a.teaserdate[0], 10) - parseInt(b.teaserdate[0], 10));

                    for (let item of data.root.teaseritem) {
                        const date = parseInt(item.teaserdate[0], 10);
                        const title = item.teasertitle[0].trim();
                        const text = item.teaser[0].trim();
                        const id = date.toString(16);
                        infoSet.push(id);

                        if (date <= ts) {
                            if (!activeTweets.hasOwnProperty(id) || hash(text) === activeTweets[id].hash) {
                                continue;
                            } else {
                                console.log('update tweet', id, text, activeTweets[id]);
                                activeTweets[id].hash = hash(text);
                                await updateTweet(tweet.id, text);
                                continue;
                            }
                        }

                        try {
                            console.log(new Date(date * 1000), title, text);
                            const tweet = await T.post('statuses/update', { status: `${title}\n${text}` });
                            activeTweets[id] = {
                                id: tweet.data.id_str,
                                hash: hash(text)
                            };
                            console.log('tweeted', id, tweet.data.id_str);

                            ts = date;
                            fs.writeFileSync('ts.txt', date);
                            fs.writeFileSync('active.txt', JSON.stringify(activeTweets));
                        } catch(e) {
                            console.error('Twit-Error:', e.statusCode, e.code, e.message);
                        }
                    }
                }

                await Promise.all(
                    Object.keys(activeTweets)
                        .filter(a => !infoSet.includes(a))
                        .map(a => {
                            const tweet = activeTweets[a];
                            delete activeTweets[a];
                            console.log('revoking', tweet.id, a, tweet.hash);
                            return updateTweet(tweet.id, 'Meldung wieder aufgehoben.');
                        })
                );

                await sleep(config.interval * 1000);
            } catch (e) {
                console.error('XML-Error:', e);
            }
        } catch (e) {
            if (e.response) {
                console.error('HTTP-Error:', e.response.status, e.response.statusText);
            } else {
                console.error('UNKW-Error:', e);
            }
        }
    }
})();
