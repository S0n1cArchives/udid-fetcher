# udid-fetcher
`udid-fetcher` is an [ExpressJS](https://github.com/expressjs/express) middleware for retrieving iOS device information such as:
- UDID
- Model
- iOS Version
- etc.

## Install
Add to your project:
```bash
$ yarn add udid-fetcher
```

## Usage
```ts
import express from 'express';
import UDIDFetcher from 'udid-fetcher';

let app = express()
let port = process.env.PORT;

app.get("/", (req, res) => {
	return res.send("visit /enroll to fetch UDID.")
})

app.use('/', new UDIDFetcher({
	name: 'Profile Name',
	description: 'Profile Description',
	identifier: 'com.example.udid_fetcher',
	organization: 'Developer Name',
	doneURL: '/',
	apiURL: `https://example.com/`,
	done: (device, req) => {
		/**
		 * device - DeviceData interface
		 * req    - ExpressJS Request interface
		 */
		console.log(device)
		console.log(req.path)
	}
}).router);

app.listen(port, () => {
	console.log(`Live at port ${port}`)
})
```

**Note:** You are required to have a callback URL that is *secure* (https). 
<br><br>



## Build from source
```bash
$ git clone https://github.com/itss0n1c/udid-fetcher.git
$ cd udid-fetcher/
$ yarn run build
```

### Testing
Make sure to have a `.env` file with the content below:
```
API_URL=https://example.com
PORT=5000
```

Then run:
```bash
$ yarn run dev
```
