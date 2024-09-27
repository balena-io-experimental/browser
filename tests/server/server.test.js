const browserBlockUrl = `http://localhost:5011`
const request = require('supertest')(browserBlockUrl)
// const fs = require('fs')
const bluebird = require('bluebird');
// const looksSame = require('looks-same')

// const { log } = require('console')

describe('Server Routes', () => {
    test("GET /ping", async () => {
        await request.get('/ping')
            .expect(200)
            .then((res) => {
                expect(res.text).toEqual('ok')
            })
    });

    test("POST /url - Navigate to balena.io", async () => {
        await request.get(`/url`)
            .expect(200)
            .then((res) => {
                expect(res.text).toEqual('file:///home/chromium/index.html')
            })

        await request.post(`/url`)
            .send({ url: 'www.balena.io' })
            .set('Accept', 'application/json')
            .expect(200)

        await bluebird.delay(4 * 1000)

        await request.get(`/url`)
            .expect(200)
            .then((res) => {
                expect(res.text).toEqual('http://www.balena.io')
            })
    })

    // const screenshotPath = `/data/screenshot.png`

    // test("GET /screenshot", async () => {
    //     await request.get(`/screenshot`)
    //         .set("Content-type", "image/png")
    //         .expect(200)
    //         .then(async (res) => {
    //             expect(res).toEqual('oki')
    //             res.pipe(fs.createWriteStream(screenshotPath))
    //             expect(fs.existsSync(screenshotPath))
    //         })

    //     await request.post(url)
    //         .attach('file', screenshotPath)
    //         .then(res => {
    //             log('\n Check it for yourself:', res.text);
    //         })
    //         .catch(err => {
    //             error('Error uploading file:', err.message);
    //         });
    // })

    // test("Screenshot is correct?", async () => {
    //     const { equal } = await looksSame(screenshotPath, '/data/testImage.png', { ignoreCaret: true, tolerance: 400 })

    //     expect({ equal }).toEqual('bro')
    // })
})
