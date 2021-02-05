import { json } from 'body-parser';
import btoa from 'btoa';
import atob from 'atob';
import { Request, Router as app } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { build, parse, PlistValue } from 'plist';
import { v4 } from 'uuid';
import fetch from 'node-fetch';

import { parse as uparse } from 'useragent';

export interface DeviceData {
	name: string,
	boardconfig: string,
	platform: string,
	cpid: number,
	bdid: number,
	model: string,
	udid: string,
	ios: {
		version: string,
		build: string,
		fixVersion?: boolean,
		signed?: boolean
		beta?: boolean
	}
}

interface WithRaw extends Request {
	rawBody: any
}

interface MC {
	PayloadContent: {
		URL: string
		DeviceAttributes: string[]
	}
	PayloadOrganization: string
	PayloadDisplayName: string
	PayloadVersion: string
	PayloadUUID: string
	PayloadIdentifier: string
	PayloadDescription: string
	PayloadType: string
}

export interface UDIDFetcherOptions {
	name: string
	organization: string
	description: string
	identifier: string
	callbackURL: string
	doneURL: string
	done: (data: DeviceData) => void
}

interface IPSWRes {
	name: string
	identifier: string
	boardconfig: string
	platform: string
	cpid: number
	bdid: number
	firmwares: {
		identifier: string
		version: string
		buildid: string
		sha1sum: string
		md5sum: string
		filesize: number
		url: string
		releasedate: string
		uploaddate: string
		signed:boolean
	}[]
}

export class UDIDFetcher {
	router = app()
	private _data: UDIDFetcherOptions
	constructor(options: UDIDFetcherOptions) {
		Object.defineProperty(this, '_data', {
			value: options,
			configurable: true,
			writable: true
		});

		this.init();
	}

	initConfigs():void {
		this.router.use(json());
	}

	async getDevice(model: string): Promise<IPSWRes> {
		const res = await fetch(`https://api.ipsw.me/v4/device/${model}?type=ipsw`);
		return res.json();
	}

	initRoutes(): void {
		this.router.get('/enroll', (req, res) => {
			let config = readFileSync(join(__dirname, '..', 'enrollment.mobileconfig'), 'utf-8');
			const xml: MC = parse(config) as unknown as MC;
			xml.PayloadContent.URL = this._data.callbackURL;
			xml.PayloadUUID = v4().toUpperCase();
			xml.PayloadIdentifier = this._data.identifier;
			xml.PayloadDisplayName = this._data.name;
			xml.PayloadOrganization = this._data.organization;
			xml.PayloadDescription = this._data.description;

			config = build(xml as unknown as PlistValue);

			//	res.set('content-type', 'application/xml').send(config);

			res.set({
				'content-type': 'application/x-apple-aspen-config; chatset=utf-8',
				'Content-Disposition':  'attachment; filename="enrollment.mobileconfig"'
			}).send(config);
		});

		this.router.post('/confirm', (req: WithRaw, res) => {
			if (typeof req.query.next !== 'undefined') {
				var rawdata = req.rawBody;
				if (typeof rawdata === 'undefined') {
					throw 'failed to get rawdata';
				}

				var data = parse(rawdata);


				return res.redirect(301, `/enrollment?data=${btoa(JSON.stringify(data))}`);
			}
		});

		this.router.get('/enrollment', async (req, res) => {
			if (typeof req.query.data !== 'undefined') {
				const data = JSON.parse(atob(req.query.data as string));

				var arr: DeviceData;

				try {
					var results = await this.getDevice(data.PRODUCT);
				} catch (e) {
					res.send(e);
					return;
				}
				arr = {
					name: results.name,
					boardconfig: results.boardconfig,
					platform: results.platform,
					cpid: results.cpid,
					bdid: results.bdid,
					udid: data.UDID,
					model: data.PRODUCT,
					ios: {
						build: data.VERSION,
						version: uparse(req.headers['user-agent']).os.toVersion()
					}
				};

				var versionFix = arr.ios.version.split('.');
				if (typeof versionFix[2] !== 'undefined') {
					if (versionFix[2] === '0') {
						versionFix.splice(2, 1);
						arr.ios.version = versionFix.join('.');
						arr.ios.fixVersion = true;
					} else {
						arr.ios.fixVersion = false;
					}
				} else {
					arr.ios.fixVersion = false;
				}


				var tmpvs = [];
				results.firmwares.forEach((item) => {
					if (arr.ios.version === item.version) {
						tmpvs.push(item);
					}
				});
				if (tmpvs.length > 0) {
					arr.ios.signed = tmpvs[0].signed;
					arr.ios.beta = false;
				} else {
					arr.ios.signed = null;
					arr.ios.beta = true;
				}

				// eslint-disable-next-line prefer-destructuring
				const done: (data: DeviceData) => Promise<void> = this._data.done as (data: DeviceData) => Promise<void>;
				await done(arr);

				res.redirect(this._data.doneURL);
			}
		});
	}

	init(): void {
		this.initRoutes();
	}
}
