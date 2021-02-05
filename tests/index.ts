import { config } from 'dotenv';
import express from 'express';
import { DeviceData, UDIDFetcher } from '../src';

config();
const app = express();
const port = process.env.PORT;

const devices: DeviceData[] = [];

app.get('/', (req, res) => res.json(devices));

app.use('/', new UDIDFetcher({
	name: 'Test thingy',
	description: 'Testing to see if this works',
	identifier: 'ca.s0n1c.test',
	organization: 'S0n1c',
	doneURL: '/',
	callbackURL: `${process.env.API_URL}/confirm`,
	done: (device) => {
		devices.push(device);
	}
}).router);


app.listen(port, () => {
	console.log(`Live at port ${port}`);
});
