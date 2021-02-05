import express from 'express';
import { DeviceData, UDIDFetcher } from '../src';

const app = express();
const port = 5000;

const devices: DeviceData[] = [];

app.get('/', (req, res) => res.json(devices));

app.use('/', new UDIDFetcher({
	name: 'Test thingy',
	description: 'Testing to see if this works',
	identifier: 'ca.s0n1c.test',
	organization: 'S0n1c',
	doneURL: '/',
	callbackURL: 'http://s0n1c-laptop.local:5000/enrollment',
	done: (device) => {
		devices.push(device);
	}
}).router);


app.listen(port, () => {
	console.log(`Live at port ${port}`);
});
