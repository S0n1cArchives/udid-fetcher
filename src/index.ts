import { json } from 'body-parser';
import btoa from 'btoa';
import atob from 'atob';
import { Request, Response, Router as app } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { build, parse, PlistValue } from 'plist';
import { v4 } from 'uuid';
import fetch from 'node-fetch';
import { format, URL, URLSearchParams } from 'url';


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
	}
}

interface WithRaw extends Request {
	rawBody: any
}

interface DeviceRequest extends Request {
	device: DeviceData
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
	apiURL: string
	query?: {
		[k: string]: string
	},
	done: (req: DeviceRequest, res: Response) => void
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
		this.router.use((req: WithRaw, res, next) => {
			req.rawBody = '';
			req.setEncoding('utf8');

			req.on('data', (chunk) => {
				req.rawBody += chunk;
			});

			req.on('end', () => {
				next();
			});
		});

		this.router.use(json());
	}

	async getDevice(model: string): Promise<IPSWRes> {
		const res = await fetch(`https://api.ipsw.me/v4/device/${model}?type=ipsw`);
		return res.json();
	}

	getVersion(results: IPSWRes, build: string): string {
		console.log(build);
		return results.firmwares.find(f => f.buildid === build).version;
	}

	getSigningStatus(results: IPSWRes, build: string): boolean {
		return results.firmwares.find(f => f.buildid === build).signed;
	}

	genString(length = 10): string {
		var result           = '';
		var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var charactersLength = characters.length;
		for (var i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	}


	initRoutes(): void {
		this.router.get('/enroll', (req, res) => {
			let config = readFileSync(join(__dirname, '..', 'enrollment.mobileconfig'), 'utf-8');
			const xml: MC = parse(config) as unknown as MC;
			const api_url = new URL(this._data.apiURL);
			api_url.pathname = join(api_url.pathname, 'confirm');
			if (typeof this._data.query !== 'undefined') {
				for (const k of Object.keys(this._data.query)) {
					api_url.searchParams.append(k, this._data.query[k]);
				}
				for (const k of Object.keys(req.query)) {
					api_url.searchParams.append(k, req.query[k] as string);
				}
			}
			xml.PayloadContent.URL = `${format(api_url)}`;
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
			console.log(req.path, req.rawBody);
			var rawdata = req.rawBody;
			if (typeof rawdata === 'undefined') {
				console.log('failed');
				throw 'failed to get rawdata';
			}

			console.log(rawdata.length);

			var data = parse(rawdata);

			const api_url = new URL(this._data.apiURL);
			api_url.pathname = join(api_url.pathname, 'enrollment');
			api_url.searchParams.append('data', btoa(JSON.stringify(data)));
			for (const k of Object.keys(req.query)) {
				api_url.searchParams.append(k, req.query[k] as string);
			}

			return res.redirect(301, `${format(api_url)}`);
		});

		this.router.get('/enrollment', async (req: DeviceRequest, res) => {
			if (!req.headers['user-agent'].includes('Profile')) {
				return res.redirect('/');
			}
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
						version: this.getVersion(results, data.VERSION),
						signed: this.getSigningStatus(results, data.VERSION)
					}
				};


				req.device = arr;
				return this._data.done(req, res);
			}
		});
	}

	init(): void {
		this.initConfigs();
		this.initRoutes();
	}
}
