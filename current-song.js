const http2 = require('http2');
const fs = require('fs');
const axios = require('axios');

const {
    HTTP2_HEADER_STATUS
} = http2.constants;

const currentSongFile = "/home/pi/currentSong.txt"
const statusFile = "/home/pi/raspo.log"

let currentBearer;
let currentBearerExpiration;

console.log(`Start listenning ${statusFile}`);

async function request(url, headers, body) {
    return new Promise((resolve, reject) => {
        let data = '';
        const client = http2.connect(url);
        client.on("error", (error) => reject(error));
        const req = client.request(headers, {});
        req.setEncoding('utf8');
        if (body) {
            req.write(Buffer.from(body, "utf-8"));
            req.end();
        } else {
	   req.end();
	}


        req.on("error", (error) => reject(error));
        req.on("response", (headers) => {

            req.on('data', (chunk) => {
                data += chunk;
            });

            req.on('end', () => {
                client.destroy();
                resolve({
                    status: headers[HTTP2_HEADER_STATUS],
                    data: data
                });
            });
        });
    });
}

function isValidBearer() {
    const now = new Date().getTime() / 1000;
    console.log(`Bearer expiration in ${Math.round(currentBearerExpiration - now)} seconds`)
    return now < (currentBearerExpiration | 0);
}

async function update() {
    if (!isValidBearer()) {
        console.log("Getting new Bearer");
        const tkBody = "grant_type=client_credentials";
        const auth = await request("https://accounts.spotify.com", {
            ":path": "/api/token",
            ":method": "POST",
            "Authorization": `Basic ${process.env.SPOTIFY_AUTH}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": tkBody.length
        }, tkBody);
        const tokenData = JSON.parse(auth.data);
        currentBearer = tokenData.access_token;
        currentBearerExpiration = (new Date().getTime() / 1000) + tokenData.expires_in;
        console.log(`New Bearer: ${currentBearer}`);
    }
    const playerEvent = fs.readFileSync(statusFile).toString().trim().split(":");
	console.log(playerEvent[0]);
    const id = playerEvent[2];

    const ret = await request("https://api.spotify.com", {
        ":path": `/v1/tracks?ids=${id}`,
        "Authorization": `Bearer ${currentBearer}`
    })
    const obj = JSON.parse(ret.data);
    if (ret.status ===  200) {
        const song = `${obj.tracks[0].name} | ${obj.tracks[0].artists.slice(0,1).map(art => art.name).join(" and ")}`;
        console.log(song);
	await axios.get(`http://192.168.15.71/text?value=${encodeURI(song)}`);
    } else {
        console.error(obj.error.message);
    }
}
console.log(process.env);

fs.watchFile(statusFile, async () => {
    update();
});
